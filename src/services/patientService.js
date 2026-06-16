/**
 * patientService.js - Migrated from Mongoose to Supabase.
 * All API contracts are preserved exactly.
 */
import { supabase } from '@/lib/supabase';
import bcrypt from 'bcryptjs';
import AppError from '@/utils/AppError';
import * as auditService from '@/services/auditService';
import crypto from 'crypto';

/**
 * Auto-generate a unique sequential patient code via Supabase counter table.
 */
const getNextPatientCode = async () => {
  // Upsert a counter row for patient_code and increment atomically
  const { data, error } = await supabase.rpc('increment_counter', { counter_id: 'patient_code' });
  if (error) {
    // Fallback: use timestamp-based code
    return `PAT-${Date.now()}`;
  }
  return `PAT-${String(data).padStart(6, '0')}`;
};

/**
 * Service to handle patient registration logic.
 */
export const registerPatient = async (patientData) => {
  const { email, phoneNumber, password, ...otherData } = patientData;

  // 1. Check for duplicate email or phone
  const { data: existing } = await supabase
    .from('patients')
    .select('id, email, phone_number')
    .or(`email.eq.${email.toLowerCase()},phone_number.eq.${phoneNumber}`)
    .limit(1)
    .maybeSingle();

  if (existing) {
    const field = existing.email === email.toLowerCase() ? 'Email' : 'Phone number';
    throw new AppError(`${field} already registered`, 409, 'DUPLICATE_ENTRY');
  }

  // 2. Hash password
  const hashedPassword = await bcrypt.hash(password, 12);

  // 3. Auto-generate patientCode
  const patientCode = await getNextPatientCode();

  // 4. Create patient
  const { data: newPatient, error: createError } = await supabase
    .from('patients')
    .insert([{
      ...Object.fromEntries(
        Object.entries(otherData).map(([k, v]) => [k.replace(/([A-Z])/g, '_$1').toLowerCase(), v])
      ),
      email: email.toLowerCase(),
      phone_number: phoneNumber,
      password: hashedPassword,
      patient_code: patientCode,
      role: 'patient',
    }])
    .select()
    .single();

  if (createError) throw createError;

  const result = { ...newPatient };
  delete result.password;
  return result;
};

/**
 * Internal helper to build base clinic-scoping query params
 */
const getPatientScopingQuery = async (user) => {
  const userId = user.id || user.userId;
  const clinicId = user.clinicId;
  const role = (user.role || '').toLowerCase();

  if (role === 'doctor') {
    return clinicId ? { clinicId } : {};
  } else if (role === 'receptionist') {
    return clinicId ? { clinicId } : null;
  } else if (role === 'admin') {
    return clinicId ? { clinicId } : {};
  } else if (role === 'clinic') {
    return { clinicId: userId };
  }
  return {};
};

/**
 * Service to fetch paginated patient list with filters and role-based access.
 */
export const getPatients = async (user, filters) => {
  const { page, limit, name, phoneNumber, startDate, endDate } = filters;
  const role = (user.role || '').toLowerCase();
  
  const scopingQuery = await getPatientScopingQuery(user);
  if (!scopingQuery) {
    return { patients: [], pagination: { totalCount: 0, totalPages: 0, currentPage: page, limit } };
  }

  let req = supabase.from('patients').select(`
    id, first_name, last_name, email, phone_number, patient_code, gender, date_of_birth, created_at, clinic_id,
    appointments (
      id, appointment_date, status,
      doctors (first_name, last_name)
    )
  `, { count: 'exact' });

  if (scopingQuery.clinicId) req = req.eq('clinic_id', scopingQuery.clinicId);

  if (name) {
    req = req.or(`first_name.ilike.%${name}%,last_name.ilike.%${name}%,phone_number.ilike.%${name}%`);
  }
  if (phoneNumber) {
    req = req.ilike('phone_number', `%${phoneNumber}%`);
  }
  if (startDate) req = req.gte('created_at', startDate);
  if (endDate) req = req.lte('created_at', endDate);

  req = req.order('created_at', { ascending: false }).range((page - 1) * limit, page * limit - 1);

  const { data, error, count } = await req;
  if (error) throw error;

  // Map to expected shape
  const patients = (data || []).map(p => {
    const completedAppointments = (p.appointments || []).filter(a => a.status === 'completed');
    completedAppointments.sort((a, b) => new Date(b.appointment_date) - new Date(a.appointment_date));
    const last = completedAppointments[0];
    return {
      _id: p.id,
      patientId: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      email: p.email,
      phoneNumber: p.phone_number,
      patientCode: p.patient_code,
      gender: p.gender,
      dateOfBirth: p.date_of_birth,
      createdAt: p.created_at,
      clinicId: p.clinic_id,
      lastVisit: last?.appointment_date || null,
      doctor: last?.doctors ? `Dr. ${last.doctors.first_name} ${last.doctors.last_name}` : null,
    };
  });

  const totalCount = count || 0;
  return {
    patients,
    pagination: {
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
      currentPage: page,
      limit,
    },
  };
};

/**
 * Service for efficient patient search.
 */
export const searchPatients = async (user, { query: searchStr, limit }) => {
  const scopingQuery = await getPatientScopingQuery(user);

  let req = supabase.from('patients')
    .select('id, first_name, last_name, email, phone_number, patient_code, gender, clinic_id')
    .or(`first_name.ilike.%${searchStr}%,last_name.ilike.%${searchStr}%,phone_number.ilike.%${searchStr}%,patient_code.ilike.%${searchStr}%`)
    .order('created_at', { ascending: false })
    .limit(limit || 10);

  if (scopingQuery?.clinicId) req = req.eq('clinic_id', scopingQuery.clinicId);

  const { data, error } = await req;
  if (error) throw error;

  return { patients: (data || []).map(p => ({ ...p, _id: p.id })) };
};

/**
 * Service to fetch a single patient profile by ID.
 */
export const getPatientById = async (id, user) => {
  const role = (user.role || '').toLowerCase();
  const clinicId = user.clinicId;

  const { data: patient, error } = await supabase
    .from('patients')
    .select('*')
    .or(`id.eq.${id},patient_code.eq.${id}`)
    .maybeSingle();

  if (error) throw error;
  if (!patient) throw new AppError('Patient not found', 404, 'NOT_FOUND');

  patient._id = patient.id;
  delete patient.password;

  const mappedPatient = {
    ...patient,
    patientId: patient.id,
    firstName: patient.first_name,
    lastName: patient.last_name,
    patientCode: patient.patient_code,
    phoneNumber: patient.phone_number,
    dateOfBirth: patient.date_of_birth,
    bloodGroup: patient.blood_group,
    emergencyContact: patient.emergency_contact,
    addressLine1: patient.address_line1 || patient.address,
    medicalHistory: patient.medical_history,
    currentMedications: patient.current_medications,
    clinicId: patient.clinic_id
  };

  // Scoping enforcement
  if (role === 'receptionist' || role === 'clinic') {
    if (clinicId && patient.clinic_id && patient.clinic_id !== clinicId) {
      throw new AppError('Access Denied', 403, 'FORBIDDEN');
    }
  }

  return mappedPatient;
};

/**
 * Service to delete a patient by ID.
 */
export const deletePatient = async (id, user) => {
  const patient = await getPatientById(id, user);

  const { error } = await supabase.from('patients').delete().eq('id', patient.id);
  if (error) throw error;

  return { id: patient.id, patientId: patient.id };
};

/**
 * Service to update patient details.
 */
export const updatePatient = async (id, patientData, user) => {
  const patient = await getPatientById(id, user);

  // Check uniqueness
  if (patientData.email && patientData.email !== patient.email) {
    const { data: dup } = await supabase.from('patients').select('id').eq('email', patientData.email).maybeSingle();
    if (dup) throw new AppError('Email already registered', 409, 'DUPLICATE_ENTRY');
  }
  if (patientData.phoneNumber && patientData.phoneNumber !== patient.phone_number) {
    const { data: dup } = await supabase.from('patients').select('id').eq('phone_number', patientData.phoneNumber).maybeSingle();
    if (dup) throw new AppError('Phone number already registered', 409, 'DUPLICATE_ENTRY');
  }

  if (patientData.password) {
    patientData.password = await bcrypt.hash(patientData.password, 12);
  }

  // Map camelCase to snake_case
  const mapped = {};
  for (const [k, v] of Object.entries(patientData)) {
    mapped[k.replace(/([A-Z])/g, '_$1').toLowerCase()] = v;
  }

  const { data: updated, error } = await supabase
    .from('patients')
    .update(mapped)
    .eq('id', patient.id)
    .select()
    .single();

  if (error) throw error;
  delete updated.password;
  updated._id = updated.id;

  await auditService.recordLog({
    user,
    action: 'UPDATE_PATIENT',
    resourceType: 'Patient',
    resourceId: updated.id,
    changes: { updatedFields: Object.keys(patientData) },
  });

  return updated;
};

/**
 * Service to fetch patient records.
 */
export const getPatientRecords = async (id, user) => {
  await getPatientById(id, user);
  return { records: [] };
};
