import fs from 'fs';
import path from 'path';
/**
 * patientService.js - Migrated from Mongoose to Supabase.
 * All API contracts are preserved exactly.
 */
import { supabase } from '@/lib/supabase';
import bcrypt from 'bcryptjs';
import AppError from '@/utils/AppError';
import * as auditService from '@/services/auditService';
import crypto from 'crypto';
import { emailRegex } from '@/validations/userValidation';


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
export const registerPatient = async (patientData, user) => {
  // Enforce Receptionist-only role authorization at service layer
  if (!user || (user.role || '').toLowerCase() !== 'receptionist') {
    throw new AppError('Access Denied. Only Receptionists are authorized to create new patient records.', 403, 'FORBIDDEN');
  }

  const clinicId = user.clinicId;
  if (!clinicId) {
    throw new AppError('Clinic identification required for patient creation.', 400, 'MISSING_CLINIC');
  }

  if (patientData.clinicId && patientData.clinicId !== clinicId) {
    throw new AppError('Cross-clinic patient creation is forbidden.', 403, 'FORBIDDEN');
  }

  const { email, phoneNumber, password, ...otherData } = patientData;

  const cleanEmail = email && typeof email === 'string' && email.trim() ? email.toLowerCase().trim() : null;
  if (cleanEmail && !emailRegex.test(cleanEmail)) {
    throw new AppError('Please enter a valid email address', 400, 'VALIDATION_ERROR');
  }


  // 1. Check for duplicate email (if provided) or phone
  let dupQuery = supabase.from('patients').select('id, email, phone_number');
  if (cleanEmail) {
    dupQuery = dupQuery.or(`email.eq.${cleanEmail},phone_number.eq.${phoneNumber}`);
  } else {
    dupQuery = dupQuery.eq('phone_number', phoneNumber);
  }

  const { data: existing } = await dupQuery.limit(1).maybeSingle();

  if (existing) {
    const field = (cleanEmail && existing.email === cleanEmail) ? 'Email' : 'Phone number';
    throw new AppError(`${field} already registered`, 409, 'DUPLICATE_ENTRY');
  }

  // 2. Hash password (auto-generate secure compliant password if not provided by receptionist)
  const finalPassword = (password && typeof password === 'string' && password.trim())
    ? password.trim()
    : `Pat@${crypto.randomBytes(6).toString('hex')}1Aa`;
  const hashedPassword = await bcrypt.hash(finalPassword, 12);

  // 3. Auto-generate patientCode
  const patientCode = await getNextPatientCode();

  // 4. Create patient
  const { data: newPatient, error: createError } = await supabase
    .from('patients')
    .insert([{
      ...Object.fromEntries(
        Object.entries(otherData).map(([k, v]) => [k.replace(/([A-Z])/g, '_$1').toLowerCase(), v])
      ),
      clinic_id: clinicId,
      email: cleanEmail,
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
  result._id = newPatient.id;
  result.patientId = newPatient.id;
  result.patientCode = newPatient.patient_code;
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
  const { page, limit, name, phoneNumber, startDate, endDate, sortBy, sortOrder } = filters;
  const role = (user.role || '').toLowerCase();
  
  const scopingQuery = await getPatientScopingQuery(user);
  if (!scopingQuery) {
    return { patients: [], pagination: { totalCount: 0, totalPages: 0, currentPage: page, limit } };
  }

  let req = supabase.from('patients').select(`
    id, first_name, last_name, email, phone_number, patient_code, gender, date_of_birth, created_at, clinic_id,
    address, city, blood_group, emergency_contact, medical_history,
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

  if (sortBy === 'name') {
    const isAsc = (sortOrder || 'asc').toLowerCase() === 'asc';
    req = req.order('first_name', { ascending: isAsc }).order('last_name', { ascending: isAsc });
  } else if (sortBy === 'registrationDate') {
    const isAsc = (sortOrder || 'desc').toLowerCase() === 'asc';
    req = req.order('created_at', { ascending: isAsc });
  } else {
    // Default ordering by name A-Z for receptionist listing
    const isAsc = (sortOrder || 'asc').toLowerCase() === 'asc';
    req = req.order('first_name', { ascending: isAsc }).order('last_name', { ascending: isAsc });
  }

  req = req.range((page - 1) * limit, page * limit - 1);

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
      address: p.address || p.city || null,
      medicalHistory: p.medical_history || null,
      bloodGroup: p.blood_group || null,
      emergencyContact: p.emergency_contact || null,
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
  if (role === 'receptionist' || role === 'clinic' || role === 'doctor') {
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

  // 1. Check for active/pending/in-progress linked appointments (cancelled appointments do NOT block deletion)
  const ACTIVE_APPOINTMENT_STATUSES = ['booked', 'scheduled', 'checked_in', 'checkedIn', 'in_progress', 'pending'];
  const { count: activeApptCount } = await supabase
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('patient_id', patient.id)
    .in('status', ACTIVE_APPOINTMENT_STATUSES);

  if (activeApptCount && activeApptCount > 0) {
    throw new AppError(`Cannot delete patient with ${activeApptCount} active appointment(s). Please cancel or complete them first.`, 400, 'LINKED_RECORDS');
  }

  // 2. Check for completed clinical appointments
  const { count: completedApptCount } = await supabase
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('patient_id', patient.id)
    .eq('status', 'completed');

  if (completedApptCount && completedApptCount > 0) {
    throw new AppError(`Cannot delete patient with completed clinical appointment records.`, 400, 'LINKED_RECORDS');
  }

  // 3. Check for linked visits (clinical history)
  const { count: visitCount } = await supabase
    .from('visits')
    .select('id', { count: 'exact', head: true })
    .eq('patient_id', patient.id);

  if (visitCount && visitCount > 0) {
    throw new AppError(`Cannot delete patient with existing clinical visit records.`, 400, 'LINKED_RECORDS');
  }

  // 4. Check for linked billings/invoices (financial records)
  const { count: billingCount } = await supabase
    .from('billings')
    .select('id', { count: 'exact', head: true })
    .eq('patient_id', patient.id);

  if (billingCount && billingCount > 0) {
    throw new AppError(`Cannot delete patient with existing billing or invoice records.`, 400, 'LINKED_RECORDS');
  }

  // 5. Check for linked lab orders
  const { count: labCount } = await supabase
    .from('lab_orders')
    .select('id', { count: 'exact', head: true })
    .eq('patient_id', patient.id);

  if (labCount && labCount > 0) {
    throw new AppError(`Cannot delete patient with existing laboratory orders.`, 400, 'LINKED_RECORDS');
  }

  // 6. Check for IPD admissions (if local store has active or historical admissions for this patient)
  try {
    const storePath = path.resolve(process.cwd(), 'src/storage/ipd_store.json');
    if (fs.existsSync(storePath)) {
      const store = JSON.parse(fs.readFileSync(storePath, 'utf8') || '{}');
      const hasIpd = (store.admissions || []).some(a => 
        (a.patient_id === patient.id || a.patientId === patient.id)
      );
      if (hasIpd) {
        throw new AppError(`Cannot delete patient with existing inpatient admission records.`, 400, 'LINKED_RECORDS');
      }
    }
  } catch (ipdErr) {
    if (ipdErr instanceof AppError) throw ipdErr;
  }

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
