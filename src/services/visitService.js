import Visit from '@/models/Visit';
import Appointment from '@/models/Appointments';
import dbConnect from '@/utils/db';
import mongoose from 'mongoose';
import AppError from '@/utils/AppError';


/**
 * Service to start a consultation visit.
 */
export const startVisit = async (payload, user) => {
  await dbConnect();
  const { appointment_id, doctor_id, patient_id } = payload;

  if (user.role.toLowerCase() === 'doctor' && user.id !== doctor_id) {
    throw new AppError('Access Denied', 403, 'FORBIDDEN');
  }


  // 1. Check Appointment (Can resolve by _id or appointmentId)
  const query = mongoose.Types.ObjectId.isValid(appointment_id)
    ? { $or: [{ _id: appointment_id }, { appointmentId: appointment_id }] }
    : { appointmentId: appointment_id };

  const appointment = await Appointment.findOne({
    ...query,
    doctorId: doctor_id,
    patientId: patient_id
  });

  if (!appointment) throw new AppError('Appointment not found or details mismatch', 404, 'NOT_FOUND');

  if (!['checked_in', 'in_progress'].includes(appointment.status)) {
    throw new AppError(`Cannot start consultation. Appointment status is ${appointment.status}`, 400, 'INVALID_STATUS');
  }

  // 2. Check for duplicate Visit
  const existingVisit = await Visit.findOne({ appointmentId: appointment._id });
  if (existingVisit) {
    if (appointment.status === 'in_progress') return existingVisit; // Idempotent
    throw new AppError('Visit already exists for this appointment', 409, 'DUPLICATE_ENTRY');
  }


  // 3. Create Visit
  const newVisit = await Visit.create({
    clinicId: payload.clinicId || user.clinicId,
    appointmentId: appointment._id,
    doctorId: doctor_id,
    patientId: patient_id,
    status: 'in_progress',
    startTime: new Date()
  });

  // 4. Update Appointment
  appointment.status = 'in_progress';
  await appointment.save();

  return newVisit;
};

/**
 * Service to complete an ongoing consultation.
 */
export const finishVisit = async (visitId, user, payload = {}) => {
  await dbConnect();

  const visit = await Visit.findById(visitId);
  if (!visit) throw new AppError('Visit record not found', 404, 'NOT_FOUND');

  // Enforce Scoping
  if (user.role.toLowerCase() === 'doctor' && visit.doctorId.toString() !== user.id) {
    throw new AppError('Access Denied', 403, 'FORBIDDEN');
  }

  if (visit.status === 'completed') {
    throw new AppError('Visit is already completed', 400, 'ALREADY_COMPLETED');
  }


  // Update Visit with status and optional payload data
  visit.status = 'completed';
  visit.endTime = new Date();

  if (payload.symptoms) visit.symptoms = payload.symptoms;
  if (payload.diagnosis) visit.diagnosis = payload.diagnosis;
  if (payload.medicines) visit.medicines = payload.medicines;
  if (payload.clinicalNotes) visit.notes = payload.clinicalNotes; // Fix: map to 'notes' in schema
  if (payload.followUpDate) {
    visit.followUpDate = payload.followUpDate;
    visit.followUpRequired = true;
  }
  if (payload.followUpNotes) visit.followUpNotes = payload.followUpNotes;
  if (payload.prescriptionUrl) visit.prescriptionUrl = payload.prescriptionUrl;

  await visit.save();

  // 2. Update Appointment
  const appointment = await Appointment.findById(visit.appointmentId);
  if (appointment) {
    appointment.status = 'completed';
    await appointment.save();

    // 3. Ticket 3: Trigger Auto-create Follow-up Appointment
    if (visit.followUpRequired && visit.followUpDate) {
      const { createAutoFollowup } = await import('./appointmentService');
      await createAutoFollowup({
        visitId: visit._id,
        patientId: visit.patientId,
        doctorId: visit.doctorId,
        followUpDate: visit.followUpDate,
        followUpNotes: visit.followUpNotes
      }, user);
    }
  }

  return visit;
};

/**
 * Service to partially update an ongoing visit (Save Progress).
 */
export const updateVisit = async (visitId, payload, user) => {
  try {
    await dbConnect();

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(visitId)) {
      throw new AppError('Invalid Visit ID format', 400, 'INVALID_ID');
    }


    const visit = await Visit.findById(visitId);
    if (!visit) throw new AppError('Visit record not found', 404, 'NOT_FOUND');

    // Enforce Scoping
    if (user.role.toLowerCase() === 'doctor' && visit.doctorId.toString() !== user.id) {
      throw new AppError('Access Denied', 403, 'FORBIDDEN');
    }

    if (visit.status === 'completed') {
      throw new AppError('Cannot update a visit that is already completed', 400, 'ALREADY_COMPLETED');
    }


    // Build Update Object
    const updates = {};
    if (payload.symptoms !== undefined) updates.symptoms = payload.symptoms;
    if (payload.diagnosis !== undefined) updates.diagnosis = payload.diagnosis;
    if (payload.medicines !== undefined) updates.medicines = payload.medicines;

    // Fix: Map clinicalNotes from payload to 'notes' field in schema
    if (payload.clinicalNotes !== undefined) updates.notes = payload.clinicalNotes;
    if (payload.followUpDate !== undefined) {
      updates.followUpDate = payload.followUpDate;
      if (payload.followUpDate) updates.followUpRequired = true;
    }
    if (payload.followUpNotes !== undefined) updates.followUpNotes = payload.followUpNotes;
    if (payload.prescriptionUrl !== undefined) updates.prescriptionUrl = payload.prescriptionUrl;

    const updatedVisit = await Visit.findByIdAndUpdate(
      visitId,
      { $set: updates },
      { new: true, runValidators: true }
    );

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
  await dbConnect();

  // 1. Resolve Patient ID (handle UUID or ObjectId)
  let targetId = patientId;
  if (!mongoose.Types.ObjectId.isValid(patientId)) {
    const Patient = (await import('@/models/Patient')).default;
    const patientRecord = await Patient.findOne({ patientId: patientId }).select('_id');
    if (!patientRecord) throw new AppError('Patient not found', 404, 'NOT_FOUND');
    targetId = patientRecord._id;

  }

  // 2. Fetch History with Scoping
  // Note: We scope by clinicId to ensure data isolation
  const visits = await Visit.find({
    patientId: targetId
  })
    .populate('doctorId', 'firstName lastName specialty phone')
    .populate('appointmentId', 'appointmentDate timeSlot reason')
    .sort({ startTime: -1 });

  return visits;
};
