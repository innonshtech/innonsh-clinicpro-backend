/**
 * appointmentService.js - Migrated from Mongoose to Supabase.
 * All business logic is preserved identically.
 */
import { supabase } from '@/lib/supabase';
import { sendSMS } from '@/utils/smsService';
import AppError from '@/utils/AppError';
import * as auditService from '@/services/auditService';
import crypto from 'crypto';

// ─── Helpers ────────────────────────────────────────────────────────────────

const toDate = (d) => {
  const date = new Date(d);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString().split('T')[0]; // YYYY-MM-DD for Supabase DATE columns
};

const findAppointment = async (id) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let req = supabase.from('appointments').select('*');
  if (uuidRegex.test(id)) {
    req = req.eq('id', id);
  } else {
    // Legacy appointmentId string: APP-XXXXXXXX
    req = req.or(`id.eq.${id}`);
  }
  const { data, error } = await req.maybeSingle();
  if (error) throw error;
  if (data) data._id = data.id;
  return data;
};

// ─── Service Functions ───────────────────────────────────────────────────────

/**
 * Service to book a new appointment.
 */
export const createAppointment = async (appointmentData, user) => {
  const { doctorId, appointmentDate, timeSlot, isEmergency, ...otherData } = appointmentData;
  const { clinicId } = user;
  const reqDate = toDate(appointmentDate);

  // 0. Leave validation
  const { data: onLeave } = await supabase
    .from('leaves')
    .select('id')
    .eq('doctor_id', doctorId)
    .eq('date', reqDate)
    .maybeSingle();

  if (onLeave) throw new AppError('Doctor is on leave on this date', 400, 'DOCTOR_ON_LEAVE');

  // 1. Double-booking check
  const { data: existingAppointment } = await supabase
    .from('appointments')
    .select('*, patients(first_name, last_name, phone_number)')
    .eq('doctor_id', doctorId)
    .eq('appointment_date', reqDate)
    .eq('time_slot', timeSlot)
    .eq('status', 'booked')
    .eq('clinic_id', clinicId)
    .maybeSingle();

  if (existingAppointment) {
    if (!isEmergency) {
      throw new AppError('Doctor already has a booked appointment at this time', 409, 'SLOT_OCCUPIED');
    }

    // Cascade Reschedule Logic for emergency
    console.log(`[EMERGENCY] Slot ${timeSlot} is occupied. Initiating cascade reschedule.`);

    const { data: availability } = await supabase
      .from('availabilities')
      .select('available_slots')
      .eq('doctor_id', doctorId)
      .eq('date', reqDate)
      .maybeSingle();

    let availableSlots = availability?.available_slots || [];
    if (availableSlots.length === 0) {
      availableSlots = [
        '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
        '12:00 PM', '12:30 PM', '01:00 PM', '01:30 PM', '02:00 PM', '02:30 PM',
        '03:00 PM', '03:30 PM', '04:00 PM', '04:30 PM', '05:00 PM',
      ];
    }

    const currentSlotIndex = availableSlots.indexOf(timeSlot);
    if (currentSlotIndex === -1) {
      throw new AppError('Requested emergency slot is not within doctors defined availability.', 400, 'INVALID_SLOT');
    }

    const { data: futureAppointments } = await supabase
      .from('appointments')
      .select('*, patients(phone_number, first_name)')
      .eq('doctor_id', doctorId)
      .eq('appointment_date', reqDate)
      .eq('status', 'booked')
      .eq('clinic_id', clinicId);

    const bookedApptsMap = new Map((futureAppointments || []).map(a => [a.time_slot, a]));

    let appointmentToMove = existingAppointment;
    let index = currentSlotIndex;
    const movedAppointments = [];

    while (appointmentToMove && index < availableSlots.length - 1) {
      const nextSlot = availableSlots[index + 1];
      const apptAtNextSlot = bookedApptsMap.get(nextSlot);

      movedAppointments.push({
        id: appointmentToMove.id,
        rescheduledFrom: appointmentToMove.time_slot,
        newTimeSlot: nextSlot,
        patientPhone: appointmentToMove.patients?.phone_number,
        patientName: appointmentToMove.patients?.first_name || 'Patient',
      });

      if (apptAtNextSlot) {
        appointmentToMove = apptAtNextSlot;
        index++;
      } else {
        appointmentToMove = null;
      }
    }

    if (appointmentToMove) {
      throw new AppError('Cascade schedule failed: Reached end of doctor availability.', 400, 'CASCADE_FAILED');
    }

    for (const app of movedAppointments) {
      await supabase.from('appointments')
        .update({ time_slot: app.newTimeSlot, rescheduled_from: app.rescheduledFrom })
        .eq('id', app.id);

      if (app.patientPhone) {
        const msg = `Dear ${app.patientName}, due to a medical emergency, your appointment has been moved from ${app.rescheduledFrom} to ${app.newTimeSlot}.`;
        await sendSMS(app.patientPhone, msg);
      }
    }
  }

  // 2. Create the appointment
  const { data: newAppointment, error } = await supabase
    .from('appointments')
    .insert([{
      ...Object.fromEntries(
        Object.entries(otherData).map(([k, v]) => [k.replace(/([A-Z])/g, '_$1').toLowerCase(), v])
      ),
      doctor_id: doctorId,
      appointment_date: reqDate,
      time_slot: timeSlot,
      clinic_id: clinicId,
      status: 'booked',
      is_emergency: isEmergency === true,
    }])
    .select()
    .single();

  if (error) throw error;
  newAppointment._id = newAppointment.id;
  return newAppointment;
};

/**
 * Service to fetch paginated and filtered list of appointments.
 */
export const getAppointmentList = async (queryParams, user) => {
  const { page, limit, doctorId, date, status } = queryParams;
  const { id: userId, role, clinicId } = user;
  const userRole = role.toLowerCase();

  let req = supabase.from('appointments').select(`
    *,
    patients (first_name, last_name, phone_number, id),
    doctors (first_name, last_name, specialty)
  `, { count: 'exact' });

  req = req.eq('clinic_id', clinicId);

  if (userRole === 'doctor') req = req.eq('doctor_id', userId);
  if (doctorId && userRole !== 'doctor') req = req.eq('doctor_id', doctorId);
  if (date) {
    req = req.gte('appointment_date', date).lte('appointment_date', date);
  }
  if (status) req = req.eq('status', status);

  req = req
    .order('appointment_date', { ascending: true })
    .order('time_slot', { ascending: true })
    .range((page - 1) * limit, page * limit - 1);

  const { data, error, count } = await req;
  if (error) throw error;

  const appointments = (data || []).map(a => ({
    ...a,
    _id: a.id,
    patientId: a.patients ? { _id: a.patients.id, ...a.patients } : a.patient_id,
    doctorId: a.doctors ? { _id: a.doctors.id, ...a.doctors } : a.doctor_id,
  }));

  return {
    appointments,
    pagination: {
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    },
  };
};

/**
 * Service to update appointment status.
 */
export const updateAppointmentStatus = async (id, status, user) => {
  const { id: userId, role, clinicId } = user;
  const userRole = role.toLowerCase();

  const appointment = await findAppointment(id);
  if (!appointment) throw new AppError('Appointment not found', 404, 'NOT_FOUND');

  if (appointment.clinic_id !== clinicId) throw new AppError('Access Denied', 403, 'FORBIDDEN');
  if (userRole === 'doctor' && appointment.doctor_id !== userId) throw new AppError('Access Denied', 403, 'FORBIDDEN');

  const targetStatus = status.toLowerCase();
  if (['in_progress', 'completed'].includes(targetStatus) && !['admin', 'receptionist', 'doctor'].includes(userRole)) {
    throw new AppError(`Cannot set status to ${targetStatus} manually.`, 400, 'INVALID_TRANSITION');
  }

  const { data: updated, error } = await supabase
    .from('appointments')
    .update({ status: targetStatus })
    .eq('id', appointment.id)
    .select()
    .single();

  if (error) throw error;
  updated._id = updated.id;
  return updated;
};

/**
 * Service to reschedule an appointment.
 */
export const rescheduleAppointment = async (id, rescheduleData, user) => {
  const { appointmentDate, timeSlot, notes } = rescheduleData;
  const { clinicId } = user;

  const appointment = await findAppointment(id);
  if (!appointment) throw new AppError('Appointment not found', 404, 'NOT_FOUND');

  if (user.role.toLowerCase() === 'doctor' && appointment.doctor_id !== user.id) {
    throw new AppError('Access Denied: You can only reschedule your own appointments', 403, 'FORBIDDEN');
  }
  if (appointment.clinic_id !== clinicId) {
    throw new AppError('Access Denied: Appointment belongs to a different clinic', 403, 'FORBIDDEN');
  }

  const reqDate = toDate(appointmentDate);

  // Check if new slot is already booked
  const { data: slotTaken } = await supabase
    .from('appointments')
    .select('id')
    .eq('doctor_id', appointment.doctor_id)
    .eq('appointment_date', reqDate)
    .eq('time_slot', timeSlot)
    .in('status', ['booked', 'scheduled', 'checked_in'])
    .neq('id', appointment.id)
    .maybeSingle();

  if (slotTaken) throw new AppError('Doctor already has a booked appointment at this new time', 409, 'SLOT_OCCUPIED');

  const updateData = { appointment_date: reqDate, time_slot: timeSlot };
  if (notes !== undefined) updateData.notes = notes;
  if (['checked_in', 'in_progress'].includes(appointment.status)) {
    updateData.status = appointment.type === 'follow_up' ? 'scheduled' : 'booked';
    updateData.queue_number = null;
    updateData.check_in_time = null;
  }

  const { data: updated, error } = await supabase
    .from('appointments')
    .update(updateData)
    .eq('id', appointment.id)
    .select()
    .single();

  if (error) throw error;

  await auditService.recordLog({
    user,
    action: 'RESCHEDULE_APPOINTMENT',
    resourceType: 'Appointment',
    resourceId: updated.id,
    changes: { newDate: appointmentDate, newSlot: timeSlot, status: updated.status },
  });

  updated._id = updated.id;
  return updated;
};

/**
 * Service to cancel an appointment.
 */
export const cancelAppointment = async (id, reason, user) => {
  const { id: userId, role, clinicId } = user;

  const appointment = await findAppointment(id);
  if (!appointment) throw new AppError('Appointment not found', 404, 'NOT_FOUND');

  if (appointment.clinic_id !== clinicId) throw new AppError('Access Denied', 403, 'FORBIDDEN');
  if (role.toLowerCase() === 'doctor' && appointment.doctor_id !== userId) {
    throw new AppError('Access Denied', 403, 'FORBIDDEN');
  }

  const { data: updated, error } = await supabase
    .from('appointments')
    .update({ status: 'cancelled', cancel_reason: reason })
    .eq('id', appointment.id)
    .select()
    .single();

  if (error) throw error;
  updated._id = updated.id;
  return updated;
};

/**
 * Patient check-in with queue number assignment.
 */
export const checkInAppointment = async (id, user, lateStrategy = 'end_of_queue') => {
  const { clinicId } = user;

  const appointment = await findAppointment(id);
  if (!appointment) throw new AppError('Appointment not found', 404, 'NOT_FOUND');
  if (appointment.clinic_id !== clinicId) throw new AppError('Access Denied', 403, 'FORBIDDEN');
  if (appointment.status === 'checked_in') throw new AppError('Patient is already checked in', 400, 'ALREADY_CHECKED_IN');
  if (!['booked', 'scheduled'].includes(appointment.status)) {
    throw new AppError(`Cannot check in appointment with status: ${appointment.status}`, 400, 'INVALID_STATUS');
  }

  // Calculate next queue number
  const { data: lastCheckedIn } = await supabase
    .from('appointments')
    .select('queue_number')
    .eq('doctor_id', appointment.doctor_id)
    .eq('clinic_id', appointment.clinic_id)
    .eq('appointment_date', appointment.appointment_date)
    .not('queue_number', 'is', null)
    .order('queue_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextQueueNumber = lastCheckedIn ? lastCheckedIn.queue_number + 1 : 1;

  const { data: updated, error } = await supabase
    .from('appointments')
    .update({
      status: 'checked_in',
      check_in_time: new Date().toISOString(),
      queue_number: nextQueueNumber,
    })
    .eq('id', appointment.id)
    .select()
    .single();

  if (error) throw error;
  updated._id = updated.id;
  return updated;
};

/**
 * Service to fetch appointment history for a specific patient.
 */
export const getPatientAppointmentHistory = async (patientId, user) => {
  const { clinicId } = user;

  // Resolve patient ID
  let targetId = patientId;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(patientId)) {
    const { data: pRecord } = await supabase.from('patients').select('id').eq('patient_code', patientId).maybeSingle();
    if (!pRecord) throw new AppError('Patient not found', 404, 'NOT_FOUND');
    targetId = pRecord.id;
  }

  const { data: appointments, error } = await supabase
    .from('appointments')
    .select(`
      *,
      doctors (first_name, last_name, specialty),
      visits (id, diagnosis, medicines)
    `)
    .eq('patient_id', targetId)
    .eq('clinic_id', clinicId)
    .order('appointment_date', { ascending: false });

  if (error) throw error;

  return (appointments || []).map(a => ({
    ...a,
    _id: a.id,
    doctorId: a.doctors ? { _id: a.doctors.id, ...a.doctors } : a.doctor_id,
    visitId: a.visits?.[0]?.id || null,
    medicines: a.visits?.[0]?.medicines || [],
    description: a.visits?.[0]?.diagnosis || null,
  }));
};

/**
 * Fetch full consultation context for the doctor desk.
 */
export const getConsultationDetails = async (appointmentId, user) => {
  const { id: userId, role, clinicId } = user;
  const userRole = role ? role.toLowerCase() : '';

  const { data: appointment, error } = await supabase
    .from('appointments')
    .select(`
      *,
      patients (*),
      doctors (*)
    `)
    .or(`id.eq.${appointmentId}`)
    .maybeSingle();

  if (error || !appointment) throw new AppError('Appointment not found or unauthorized', 404, 'NOT_FOUND');

  if (clinicId && appointment.clinic_id !== clinicId) throw new AppError('Access Denied', 403, 'FORBIDDEN');
  if (userRole === 'doctor' && appointment.doctor_id !== userId) throw new AppError('Access Denied', 403, 'FORBIDDEN');

  const { data: currentVisit } = await supabase
    .from('visits')
    .select('*')
    .eq('appointment_id', appointment.id)
    .maybeSingle();

  const { data: history } = await supabase
    .from('appointments')
    .select('id, appointment_date, status, time_slot')
    .eq('patient_id', appointment.patient_id)
    .eq('status', 'completed')
    .order('appointment_date', { ascending: false })
    .limit(5);

  const { data: lastVisit } = await supabase
    .from('visits')
    .select('diagnosis, notes, created_at')
    .eq('patient_id', appointment.patient_id)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const patientObj = { ...appointment.patients, _id: appointment.patients?.id };
  if (lastVisit) {
    patientObj.lastVisitSummary = lastVisit.diagnosis || lastVisit.notes || `Visited on ${new Date(lastVisit.created_at).toLocaleDateString()}`;
  }

  return {
    appointment: { ...appointment, _id: appointment.id },
    patient: patientObj,
    visit: currentVisit,
    history: history || [],
  };
};

/**
 * Complete a consultation.
 */
export const completeConsultation = async (appointmentId, consultationData, user) => {
  const { data: appointment } = await supabase
    .from('appointments')
    .select('*')
    .eq('id', appointmentId)
    .eq('doctor_id', user.id)
    .maybeSingle();

  if (!appointment) throw new AppError('Appointment not found or unauthorized', 404, 'NOT_FOUND');
  if (appointment.status === 'completed') throw new AppError('Consultation already completed', 400, 'ALREADY_COMPLETED');

  const { data: visit } = await supabase
    .from('visits')
    .select('*')
    .eq('appointment_id', appointment.id)
    .maybeSingle();

  if (!visit) throw new AppError('Visit record not found. Please start consultation first.', 404, 'NOT_FOUND');

  const { data: updatedVisit, error: visitError } = await supabase
    .from('visits')
    .update({
      status: 'completed',
      end_time: new Date().toISOString(),
      medicines: consultationData.medicines || [],
      diagnosis: consultationData.diagnosis || '',
    })
    .eq('id', visit.id)
    .select()
    .single();

  if (visitError) throw visitError;

  await supabase.from('appointments').update({ status: 'completed' }).eq('id', appointment.id);

  updatedVisit._id = updatedVisit.id;
  return updatedVisit;
};

/**
 * Auto-create a follow-up appointment.
 */
export const createAutoFollowup = async (data, user) => {
  const { visitId, patientId, doctorId, followUpDate, followUpNotes } = data;
  const { clinicId } = user;

  const { data: existing } = await supabase
    .from('appointments')
    .select('id')
    .eq('linked_visit_id', visitId)
    .maybeSingle();

  if (existing) return { ...existing, _id: existing.id };

  const [{ data: doctor }, { data: patient }] = await Promise.all([
    supabase.from('doctors').select('first_name, last_name').eq('id', doctorId).maybeSingle(),
    supabase.from('patients').select('first_name, last_name').eq('id', patientId).maybeSingle(),
  ]);

  const targetDate = toDate(followUpDate);
  let slot = '09:00 AM';

  const { data: isOccupied } = await supabase
    .from('appointments')
    .select('id')
    .eq('doctor_id', doctorId)
    .eq('appointment_date', targetDate)
    .eq('time_slot', slot)
    .in('status', ['booked', 'scheduled', 'checked_in', 'in_progress'])
    .maybeSingle();

  if (isOccupied) {
    slot = `FU-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
  }

  const { data: newAppointment, error } = await supabase
    .from('appointments')
    .insert([{
      patient_id: patientId,
      doctor_id: doctorId,
      clinic_id: clinicId,
      appointment_date: targetDate,
      time_slot: slot,
      status: 'scheduled',
      type: 'follow_up',
      linked_visit_id: visitId,
      reason: followUpNotes || 'Follow-up Consultation',
      doctor_name: doctor ? `Dr. ${doctor.last_name}` : 'Unknown Doctor',
      patient_name: patient ? `${patient.first_name} ${patient.last_name}` : 'Unknown Patient',
    }])
    .select()
    .single();

  if (error) throw error;
  newAppointment._id = newAppointment.id;
  return newAppointment;
};

/**
 * Fetch daily appointments for a specific doctor.
 */
export const fetchDoctorDailyAppointments = async (doctorId, date, clinicId) => {
  const queryDate = date || new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('appointments')
    .select(`
      *,
      patients (first_name, last_name, phone_number, id, patient_code)
    `)
    .eq('doctor_id', doctorId)
    .eq('clinic_id', clinicId)
    .eq('appointment_date', queryDate)
    .neq('status', 'cancelled')
    .order('queue_number', { ascending: true })
    .order('time_slot', { ascending: true });

  if (error) throw error;

  return (data || []).map(a => ({
    ...a,
    _id: a.id,
    patientId: a.patients ? { _id: a.patients.id, ...a.patients } : a.patient_id,
  }));
};
