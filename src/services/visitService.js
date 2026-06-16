/**
 * visitService.js - Migrated from Mongoose to Supabase.
 * All business logic is preserved.
 */
import { supabase } from '@/lib/supabase';
import AppError from '@/utils/AppError';
import { createAutoFollowup } from './appointmentService';

/**
 * Service to start a consultation visit.
 */
export const startVisit = async (payload, user) => {
  const { appointment_id, doctor_id, patient_id } = payload;

  if (user.role.toLowerCase() === 'doctor' && user.id !== doctor_id) {
    throw new AppError('Access Denied', 403, 'FORBIDDEN');
  }

  // 1. Check Appointment
  const { data: appointment, error: apptError } = await supabase
    .from('appointments')
    .select('*')
    .eq('id', appointment_id)
    .eq('doctor_id', doctor_id)
    .eq('patient_id', patient_id)
    .maybeSingle();

  if (apptError) throw apptError;
  if (!appointment) throw new AppError('Appointment not found or details mismatch', 404, 'NOT_FOUND');

  if (!['checked_in', 'in_progress'].includes(appointment.status)) {
    throw new AppError(`Cannot start consultation. Appointment status is ${appointment.status}`, 400, 'INVALID_STATUS');
  }

  // 2. Check for duplicate Visit
  const { data: existingVisit } = await supabase
    .from('visits')
    .select('*')
    .eq('appointment_id', appointment.id)
    .maybeSingle();

  if (existingVisit) {
    if (appointment.status === 'in_progress') {
      existingVisit._id = existingVisit.id;
      return existingVisit;
    }
    throw new AppError('Visit already exists for this appointment', 409, 'DUPLICATE_ENTRY');
  }

  // 3. Create Visit
  const { data: newVisit, error: visitError } = await supabase
    .from('visits')
    .insert([{
      clinic_id: payload.clinicId || user.clinicId,
      appointment_id: appointment.id,
      doctor_id: doctor_id,
      patient_id: patient_id,
      status: 'in_progress',
      start_time: new Date().toISOString(),
    }])
    .select()
    .single();

  if (visitError) throw visitError;

  // 4. Update Appointment
  await supabase.from('appointments').update({ status: 'in_progress' }).eq('id', appointment.id);

  newVisit._id = newVisit.id;
  return newVisit;
};

/**
 * Service to complete an ongoing consultation.
 */
export const finishVisit = async (visitId, user, payload = {}) => {
  const { data: visit, error } = await supabase.from('visits').select('*').eq('id', visitId).maybeSingle();
  if (error) throw error;
  if (!visit) throw new AppError('Visit record not found', 404, 'NOT_FOUND');

  if (user.role.toLowerCase() === 'doctor' && visit.doctor_id !== user.id) {
    throw new AppError('Access Denied', 403, 'FORBIDDEN');
  }
  if (visit.status === 'completed') {
    throw new AppError('Visit is already completed', 400, 'ALREADY_COMPLETED');
  }

  const updateData = {
    status: 'completed',
    end_time: new Date().toISOString(),
  };
  if (payload.symptoms) updateData.symptoms = payload.symptoms;
  if (payload.diagnosis) updateData.diagnosis = payload.diagnosis;
  if (payload.medicines) updateData.medicines = payload.medicines;
  if (payload.clinicalNotes) updateData.notes = payload.clinicalNotes;
  if (payload.followUpDate) {
    updateData.follow_up_date = payload.followUpDate;
    updateData.follow_up_required = true;
  }
  if (payload.followUpNotes) updateData.follow_up_notes = payload.followUpNotes;
  if (payload.prescriptionUrl) updateData.prescription_url = payload.prescriptionUrl;

  const { data: updatedVisit, error: updateError } = await supabase
    .from('visits')
    .update(updateData)
    .eq('id', visitId)
    .select()
    .single();

  if (updateError) throw updateError;

  // Update Appointment status
  await supabase.from('appointments').update({ status: 'completed' }).eq('id', visit.appointment_id);

  // Auto-create follow-up if needed
  if (updateData.follow_up_required && updateData.follow_up_date) {
    await createAutoFollowup({
      visitId: updatedVisit.id,
      patientId: updatedVisit.patient_id,
      doctorId: updatedVisit.doctor_id,
      followUpDate: updatedVisit.follow_up_date,
      followUpNotes: updatedVisit.follow_up_notes,
    }, user);
  }

  updatedVisit._id = updatedVisit.id;
  return updatedVisit;
};

/**
 * Service to partially update an ongoing visit (Save Progress).
 */
export const updateVisit = async (visitId, payload, user) => {
  try {
    const { data: visit } = await supabase.from('visits').select('*').eq('id', visitId).maybeSingle();
    if (!visit) throw new AppError('Visit record not found', 404, 'NOT_FOUND');

    if (user.role.toLowerCase() === 'doctor' && visit.doctor_id !== user.id) {
      throw new AppError('Access Denied', 403, 'FORBIDDEN');
    }
    if (visit.status === 'completed') {
      throw new AppError('Cannot update a visit that is already completed', 400, 'ALREADY_COMPLETED');
    }

    const updates = {};
    if (payload.symptoms !== undefined) updates.symptoms = payload.symptoms;
    if (payload.diagnosis !== undefined) updates.diagnosis = payload.diagnosis;
    if (payload.medicines !== undefined) updates.medicines = payload.medicines;
    if (payload.clinicalNotes !== undefined) updates.notes = payload.clinicalNotes;
    if (payload.followUpDate !== undefined) {
      updates.follow_up_date = payload.followUpDate;
      if (payload.followUpDate) updates.follow_up_required = true;
    }
    if (payload.followUpNotes !== undefined) updates.follow_up_notes = payload.followUpNotes;
    if (payload.prescriptionUrl !== undefined) updates.prescription_url = payload.prescriptionUrl;

    const { data: updatedVisit, error } = await supabase
      .from('visits')
      .update(updates)
      .eq('id', visitId)
      .select()
      .single();

    if (error) throw error;
    updatedVisit._id = updatedVisit.id;
    return updatedVisit;
  } catch (error) {
    console.error('DEBUG: updateVisit Service Failed:', error.message);
    throw error;
  }
};

/**
 * Service to fetch visit history for a specific patient.
 */
export const getPatientVisitHistory = async (patientId, user) => {
  let targetId = patientId;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(patientId)) {
    const { data: pRecord } = await supabase.from('patients').select('id').eq('patient_code', patientId).maybeSingle();
    if (!pRecord) throw new AppError('Patient not found', 404, 'NOT_FOUND');
    targetId = pRecord.id;
  }

  const { data, error } = await supabase
    .from('visits')
    .select(`
      *,
      doctors (first_name, last_name, specialty, phone),
      appointments!fk_visit_appointment(appointment_date, time_slot, reason)
    `)
    .eq('patient_id', targetId)
    .order('start_time', { ascending: false });

  if (error) throw error;

  return (data || []).map(v => ({
    ...v,
    _id: v.id,
    startTime: v.start_time,
    endTime: v.end_time,
    clinicalNotes: v.notes,
    followUpDate: v.follow_up_date,
    doctorId: v.doctors ? { 
      _id: v.doctors.id, 
      ...v.doctors,
      firstName: v.doctors.first_name,
      lastName: v.doctors.last_name
    } : v.doctor_id,
    appointmentId: v.appointments ? { 
      _id: v.appointments.id, 
      ...v.appointments,
      appointmentDate: v.appointments.appointment_date,
      timeSlot: v.appointments.time_slot
    } : v.appointment_id,
  }));
};
