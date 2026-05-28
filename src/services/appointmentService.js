import Appointment from '@/models/Appointments';
import Availability from '@/models/Availability';
import Patient from '@/models/Patient';
import Doctor from '@/models/Doctor';
import { sendSMS } from '@/utils/smsService';
import dbConnect from '@/utils/db';
import mongoose from 'mongoose';
import AppError from '@/utils/AppError';
import * as auditService from '@/services/auditService';


/**
 * Service to book a new appointment.
 * @param {Object} appointmentData - Data from the request body
 * @param {Object} user - Authenticated user object (from req.user)
 */
export const createAppointment = async (appointmentData, user) => {
  await dbConnect();

  const {
    doctorId,
    appointmentDate,
    timeSlot,
    isEmergency,
    ...otherData
  } = appointmentData;
  const { clinicId } = user;

  const reqDate = new Date(appointmentDate);
  reqDate.setUTCHours(0, 0, 0, 0);

  // 0. Leave validation
  const Leave = mongoose.models.Leave || mongoose.model('Leave');
  const onLeave = await Leave.findOne({
    doctorId: new mongoose.Types.ObjectId(doctorId),
    date: reqDate
  });

  if (onLeave) {
    throw new AppError('Doctor is on leave on this date', 400, 'DOCTOR_ON_LEAVE');
  }

  // 1. Double-booking prevention
  // Check if this doctor already has an appointment booked for the same date and time slot
  const existingAppointment = await Appointment.findOne({
    doctorId,
    appointmentDate: reqDate,
    timeSlot,
    status: 'booked',
    clinicId // Within the same clinic
  }).populate('patientId');

  if (existingAppointment) {
    if (!isEmergency) {
      const error = new AppError('Doctor already has a booked appointment at this time', 409, 'SLOT_OCCUPIED');
      throw error;
    }


    // Cascade Reschedule Logic
    console.log(`[EMERGENCY] Slot ${timeSlot} is occupied. Initiating cascade reschedule.`);

    // Fetch doctor's availability for the day to know the slot sequence
    let availability = await Availability.findOne({
      doctorId: new mongoose.Types.ObjectId(doctorId),
      date: reqDate,
      clinicId
    });

    let availableSlots = availability?.availableSlots || [];

    // Safety Net: If no availability record, use default 9-5 sequence
    if (availableSlots.length === 0) {
      console.log(`[EMERGENCY] No availability record found. Using default slot sequence (9 AM - 5 PM).`);
      availableSlots = [
        '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
        '12:00 PM', '12:30 PM', '01:00 PM', '01:30 PM', '02:00 PM', '02:30 PM',
        '03:00 PM', '03:30 PM', '04:00 PM', '04:30 PM', '05:00 PM'
      ];
    }

    const currentSlotIndex = availableSlots.indexOf(timeSlot);

    if (currentSlotIndex === -1) {
      throw new AppError('Requested emergency slot is not within doctors defined availability.', 400, 'INVALID_SLOT');
    }


    // Find all booked appointments for this doctor on this day
    const futureAppointments = await Appointment.find({
      doctorId,
      appointmentDate: reqDate,
      status: 'booked',
      clinicId
    }).populate('patientId');

    const bookedApptsMap = new Map();
    futureAppointments.forEach(app => bookedApptsMap.set(app.timeSlot, app));

    let appointmentToMove = existingAppointment;

    // Step-by-step bumping
    let index = currentSlotIndex;
    let movedAppointments = [];

    // We take the current appointment, and we need to push it to the next slot (index + 1).
    // If index + 1 is booked, we push the one at index+1 to index+2, etc.
    while (appointmentToMove && index < availableSlots.length - 1) {
      const nextSlot = availableSlots[index + 1];
      const apptAtNextSlot = bookedApptsMap.get(nextSlot);

      // Update appointmentToMove to nextSlot
      appointmentToMove.rescheduledFrom = appointmentToMove.timeSlot;
      appointmentToMove.timeSlot = nextSlot;
      movedAppointments.push(appointmentToMove);

      if (apptAtNextSlot) {
        // Next slot is also occupied, we need to move it in the next iteration
        appointmentToMove = apptAtNextSlot;
        index++;
      } else {
        // Next slot is free, cascade ends
        appointmentToMove = null;
      }
    }

    if (appointmentToMove) {
      throw new AppError('Cascade schedule failed: Reached the end of doctors availability for the day. Cannot push appointments further.', 400, 'CASCADE_FAILED');
    }


    // Save all moved appointments and send SMS
    for (const app of movedAppointments) {
      await app.save();

      // Send SMS
      const patientPhone = app.patientId?.phoneNumber;
      if (patientPhone) {
        const msg = `Dear ${app.patientId?.firstName || 'Patient'}, due to a medical emergency at the clinic, your appointment has been moved from ${app.rescheduledFrom} to ${app.timeSlot}. Sorry for the inconvenience.`;
        const smsRes = await sendSMS(patientPhone, msg);
        if (smsRes.success) {
          app.smsNotified = true;
          await app.save();
        }
      }
    }
  }

  // 2. Create the emergency/normal appointment
  const newAppointment = await Appointment.create({
    ...otherData,
    doctorId,
    appointmentDate: reqDate,
    timeSlot,
    clinicId,
    status: 'booked',
    isEmergency: isEmergency === true
  });

  return newAppointment;
};

/**
 * Service to fetch paginated and filtered list of appointments.
 * @param {Object} queryParams - Query filters and pagination
 * @param {Object} user - Authenticated user object
 */
export const getAppointmentList = async (queryParams, user) => {
  await dbConnect();

  const { page, limit, doctorId, date, status } = queryParams;
  const { id: userId, role, clinicId } = user;
  const userRole = role.toLowerCase();

  // 1. Build Scoping Query
  let scopingQuery = { clinicId };

  if (userRole === 'doctor') {
    // Doctors only see their own appointments
    scopingQuery.doctorId = userId;
  }

  // 2. Build Filter Query
  const filterQuery = { ...scopingQuery };

  if (doctorId && userRole !== 'doctor') {
    filterQuery.doctorId = doctorId;
  }

  if (date) {
    // Standardize to UTC start and end of day to avoid timezone-related misses
    const startOfDay = new Date(date);
    startOfDay.setUTCHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setUTCHours(23, 59, 59, 999);
    
    filterQuery.appointmentDate = { $gte: startOfDay, $lte: endOfDay };
  }

  if (status) {
    filterQuery.status = status;
  }

  // 3. Execute Query with Pagination and Sorting
  const skip = (page - 1) * limit;

  const [appointments, total] = await Promise.all([
    Appointment.find(filterQuery)
      .populate('patientId', 'firstName lastName phoneNumber patientId')
      .populate('doctorId', 'firstName lastName specialty')
      .sort({ appointmentDate: 1, timeSlot: 1 })
      .skip(skip)
      .limit(limit),
    Appointment.countDocuments(filterQuery)
  ]);

  return {
    appointments,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};

/**
 * Service to update appointment status.
 * @param {string} id - Appointment ID or _id
 * @param {string} status - New status
 * @param {Object} user - Authenticated user object
 */
export const updateAppointmentStatus = async (id, status, user) => {
  await dbConnect();

  const { id: userId, role, clinicId } = user;
  const userRole = role.toLowerCase();

  // 1. Find Appointment and Verify Scoping
  const appointment = await Appointment.findOne({
    $or: [
      { _id: mongoose.Types.ObjectId.isValid(id) ? id : null },
      { appointmentId: id }
    ].filter(q => q._id !== null)
  });

  if (!appointment) {
    throw new AppError('Appointment not found', 404, 'NOT_FOUND');
  }


  // 2. Enforce RBAC/Scoping
  if (appointment.clinicId !== clinicId) {
    throw new AppError('Access Denied', 403, 'FORBIDDEN');
  }

  if (userRole === 'doctor' && appointment.doctorId.toString() !== userId) {
    throw new AppError('Access Denied', 403, 'FORBIDDEN');
  }


  // 3. Status Transition Logic & Role Restrictions
  const targetStatus = status.toLowerCase();

  // Prevent setting 'in_progress' or 'completed' via this generic update service
  if (['in_progress', 'completed'].includes(targetStatus) && !['admin', 'receptionist', 'doctor'].includes(userRole)) {
    throw new AppError(`Cannot set status to ${targetStatus} manually. Please use the clinical consultation flow.`, 400, 'INVALID_TRANSITION');
  }

  // 4. Update Status
  appointment.status = targetStatus;
  await appointment.save();

  return appointment;
};

/**
 * Service to reschedule an appointment.
 * @param {string} id - Appointment ID
 * @param {Object} rescheduleData - New date and time slot
 * @param {Object} user - Authenticated user object
 */
export const rescheduleAppointment = async (id, rescheduleData, user) => {
  await dbConnect();

  const { appointmentDate, timeSlot, notes } = rescheduleData;
  const { clinicId } = user;

  const appointment = await Appointment.findOne({
    $or: [
      { _id: mongoose.Types.ObjectId.isValid(id) ? id : null },
      { appointmentId: id }
    ].filter(q => q._id !== null)
  });

  if (!appointment) {
    throw new AppError('Appointment not found', 404, 'NOT_FOUND');
  }

  // Check authorization - allow admin, receptionist, or the assigned doctor
  if (user.role.toLowerCase() === 'doctor' && appointment.doctorId.toString() !== user.id) {
    throw new AppError('Access Denied: You can only reschedule your own appointments', 403, 'FORBIDDEN');
  }
  
  if (appointment.clinicId !== clinicId) {
    throw new AppError('Access Denied: Appointment belongs to a different clinic', 403, 'FORBIDDEN');
  }

  const reqDate = new Date(appointmentDate);
  reqDate.setUTCHours(0, 0, 0, 0);

  // Check if the new slot is already booked for the SAME doctor
  const existingAppointment = await Appointment.findOne({
    doctorId: appointment.doctorId,
    appointmentDate: reqDate,
    timeSlot,
    status: { $in: ['booked', 'scheduled', 'checked_in'] },
    clinicId,
    _id: { $ne: appointment._id } // Exclude current appointment
  });

  if (existingAppointment) {
    throw new AppError('Doctor already has a booked appointment at this new time', 409, 'SLOT_OCCUPIED');
  }

  // Update appointment details
  appointment.appointmentDate = reqDate;
  appointment.timeSlot = timeSlot;
  if (notes !== undefined) {
    appointment.notes = notes;
  }

  // If the appointment was checked in or in progress, reset it back to initial state
  // because they are changing the time/date, they lose their spot in the queue.
  if (['checked_in', 'in_progress'].includes(appointment.status)) {
    appointment.status = appointment.type === 'follow_up' ? 'scheduled' : 'booked';
    appointment.queueNumber = undefined;
    appointment.checkInTime = undefined;
  }

  await appointment.save();

  // Audit Log
  await auditService.recordLog({
    user,
    action: 'RESCHEDULE_APPOINTMENT',
    resourceType: 'Appointment',
    resourceId: appointment.appointmentId || appointment._id.toString(),
    changes: {
      newDate: appointmentDate,
      newSlot: timeSlot,
      status: appointment.status
    }
  });

  return appointment;
};

/**
 * Service to logically cancel an appointment.
 * @param {string} id - Appointment ID or _id
 * @param {string} reason - Cancellation reason
 * @param {Object} user - Authenticated user object
 */
export const cancelAppointment = async (id, reason, user) => {
  await dbConnect();

  const { id: userId, role, clinicId } = user;
  const userRole = role.toLowerCase();

  // 1. Find Appointment and Verify Scoping
  const appointment = await Appointment.findOne({
    $or: [
      { _id: mongoose.Types.ObjectId.isValid(id) ? id : null },
      { appointmentId: id }
    ].filter(q => q._id !== null)
  });

  if (!appointment) {
    throw new AppError('Appointment not found', 404, 'NOT_FOUND');
  }


  // 2. Enforce RBAC/Scoping (Staff/Admin only for this operation per ticket)
  if (appointment.clinicId !== clinicId) {
    throw new AppError('Access Denied', 403, 'FORBIDDEN');
  }

  // Allow doctors to cancel their own appointments too, though typically a front-desk task
  if (userRole === 'doctor' && appointment.doctorId.toString() !== userId) {
    throw new AppError('Access Denied', 403, 'FORBIDDEN');
  }


  // 3. Mark as Cancelled
  appointment.status = 'cancelled';
  appointment.cancelReason = reason;
  await appointment.save();

  return appointment;
};

/**
 * Service to fetch appointment history for a specific patient.
 * @param {string} patientId - Patient ID (UUID or ObjectId)
 * @param {Object} user - Authenticated user object
 */
/**
 * Service to handle patient check-in.
 * Assigns sequential queue number per doctor per day.
 * 
 * @param {string} id - Appointment ID or _id
 * @param {Object} user - Authenticated user context
 */
export const checkInAppointment = async (id, user, lateStrategy = 'end_of_queue') => {
  await dbConnect();

  const { role, clinicId } = user;
  const userRole = role.toLowerCase();

  // 1. Find Appointment (Standardized finding logic)
  const appointment = await Appointment.findOne({
    $or: [
      { _id: mongoose.Types.ObjectId.isValid(id) ? id : null },
      { appointmentId: id }
    ].filter(q => q._id !== null)
  });

  if (!appointment) {
    throw new AppError('Appointment not found', 404, 'NOT_FOUND');
  }


  // 2. Scoping and RBAC (Implicitly handled by controller's withRoles, but double check clinic)
  if (appointment.clinicId !== clinicId) {
    throw new AppError('Access Denied', 403, 'FORBIDDEN');
  }


  // 3. Validation
  if (appointment.status === 'checked_in') {
    throw new AppError('Patient is already checked in', 400, 'ALREADY_CHECKED_IN');
  }

  if (!['booked', 'scheduled'].includes(appointment.status)) {
    throw new AppError(`Cannot check in appointment with status: ${appointment.status}`, 400, 'INVALID_STATUS');
  }


  // 4. Calculate Queue Number
  // Start and end of the day for the appointment date
  const startOfDay = new Date(appointment.appointmentDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(appointment.appointmentDate);
  endOfDay.setHours(23, 59, 59, 999);

  let nextQueueNumber = 1;

  if (lateStrategy === 'keep_priority') {
    // Find the currently active or highest completed patient's queue number
    const activeOrPast = await Appointment.findOne({
      doctorId: appointment.doctorId,
      clinicId: appointment.clinicId,
      appointmentDate: { $gte: startOfDay, $lte: endOfDay },
      status: { $in: ['in_progress', 'completed'] },
      queueNumber: { $exists: true }
    }).sort({ queueNumber: -1 });

    const insertAfterQueueNumber = activeOrPast ? activeOrPast.queueNumber : 0;
    
    // Check if there are any waiting patients we need to jump ahead of
    const waitingPatientsCount = await Appointment.countDocuments({
      doctorId: appointment.doctorId,
      clinicId: appointment.clinicId,
      appointmentDate: { $gte: startOfDay, $lte: endOfDay },
      status: 'checked_in',
      queueNumber: { $gt: insertAfterQueueNumber }
    });

    if (waitingPatientsCount > 0) {
      // Shift everyone currently checked_in and waiting up by 1
      await Appointment.updateMany({
        doctorId: appointment.doctorId,
        clinicId: appointment.clinicId,
        appointmentDate: { $gte: startOfDay, $lte: endOfDay },
        status: 'checked_in',
        queueNumber: { $gt: insertAfterQueueNumber }
      }, {
        $inc: { queueNumber: 1 }
      });
      nextQueueNumber = insertAfterQueueNumber + 1;
    } else {
      // No waiting patients, so just assign next sequential number
      const lastCheckedIn = await Appointment.findOne({
        doctorId: appointment.doctorId,
        clinicId: appointment.clinicId,
        appointmentDate: { $gte: startOfDay, $lte: endOfDay },
        queueNumber: { $exists: true }
      }).sort({ queueNumber: -1 });
      nextQueueNumber = lastCheckedIn ? lastCheckedIn.queueNumber + 1 : 1;
    }
  } else {
    // end_of_queue
    const lastCheckedIn = await Appointment.findOne({
      doctorId: appointment.doctorId,
      clinicId: appointment.clinicId,
      appointmentDate: { $gte: startOfDay, $lte: endOfDay },
      queueNumber: { $exists: true }
    }).sort({ queueNumber: -1 });
  
    nextQueueNumber = lastCheckedIn ? lastCheckedIn.queueNumber + 1 : 1;
  }

  // 5. Apply Updates
  appointment.status = 'checked_in';
  appointment.checkInTime = new Date();
  appointment.queueNumber = nextQueueNumber;

  await appointment.save();

  return appointment;
};

export const getPatientAppointmentHistory = async (patientId, user) => {
  await dbConnect();

  const { clinicId } = user;

  // 1. Resolve Patient ID (handle UUID or ObjectId)
  let targetId = patientId;
  if (!mongoose.Types.ObjectId.isValid(patientId)) {
    const Patient = (await import('@/models/Patient')).default;
    const patientRecord = await Patient.findOne({ patientId: patientId }).select('_id');
    if (!patientRecord) throw new AppError('Patient not found', 404, 'NOT_FOUND');
    targetId = patientRecord._id;

  }

  // 2. Fetch History with Scoping
  const appointments = await Appointment.find({
    patientId: targetId,
    clinicId
  })
    .populate('doctorId', 'firstName lastName specialty')
    .sort({ appointmentDate: -1, timeSlot: -1 })
    .lean();

  const Visit = (await import('@/models/Visit')).default;
  const appointmentIds = appointments.map(app => app._id);
  const visits = await Visit.find({ appointmentId: { $in: appointmentIds } }).lean();

  const visitsMap = {};
  visits.forEach(v => visitsMap[v.appointmentId.toString()] = v);

  const enrichedAppointments = appointments.map(app => {
    const visit = visitsMap[app._id.toString()];
    if (visit) {
      app.visitId = visit._id;
      app.medicines = visit.medicines;
      app.description = visit.diagnosis;
    }
    return app;
  });

  return enrichedAppointments;
};

/**
 * Service to fetch daily appointments for a logged-in doctor.
 * @param {string} doctorId - Doctor's ID
 * @param {string} date - Date string 'YYYY-MM-DD'
 * @param {string} clinicId - Clinic ID for data isolation
 */

/**
 * Fetch full consultation context for the doctor desk.
 */
export const getConsultationDetails = async (appointmentId, user) => {
  await dbConnect();

  const { id: userId, role, clinicId } = user;
  const userRole = role ? role.toLowerCase() : '';

  const query = {
    $or: [
      { _id: mongoose.Types.ObjectId.isValid(appointmentId) ? appointmentId : null },
      { appointmentId: appointmentId }
    ].filter(q => q._id !== null || q.appointmentId !== undefined)
  };
  
  if (clinicId) {
    query.clinicId = clinicId;
  }

  if (userRole === 'doctor') {
    query.doctorId = userId;
  }

  const appointment = await Appointment.findOne(query).populate('patientId doctorId');

  if (!appointment) {
    throw new AppError('Appointment not found or unauthorized', 404, 'NOT_FOUND');
  }


  // Fetch current Visit record if it exists
  const Visit = (await import('@/models/Visit')).default;
  const currentVisit = await Visit.findOne({ appointmentId: appointment._id });

  // Also fetch past history for the patient
  const history = await Appointment.find({
    patientId: appointment.patientId._id,
    status: 'completed'
  }).sort({ appointmentDate: -1 }).limit(5);

  const lastVisit = await Visit.findOne({
    patientId: appointment.patientId._id,
    status: 'completed'
  }).sort({ createdAt: -1 });

  const patientObj = appointment.patientId.toObject ? appointment.patientId.toObject() : appointment.patientId;
  if (lastVisit) {
    patientObj.lastVisitSummary = lastVisit.diagnosis || lastVisit.notes || `Visited on ${lastVisit.createdAt.toLocaleDateString()}`;
  }

  return {
    appointment,
    patient: patientObj,
    visit: currentVisit,
    history
  };
};


/**
 * Complete a consultation, saving notes, prescription and marking status done.
 */
export const completeConsultation = async (appointmentId, consultationData, user) => {
  await dbConnect();

  const appointment = await Appointment.findOne({
    _id: appointmentId,
    doctorId: user.id
  });

  if (!appointment) {
    throw new AppError('Appointment not found or unauthorized', 404, 'NOT_FOUND');
  }
  if (appointment.status === 'completed') {
    throw new AppError('Consultation already completed', 400, 'ALREADY_COMPLETED');
  }


  const Visit = (await import('@/models/Visit')).default;
  const visit = await Visit.findOne({ appointmentId: appointment._id });

  if (!visit) {
    throw new AppError('Visit record not found. Please start consultation first.', 404, 'NOT_FOUND');
  }


  visit.status = 'completed';
  visit.endTime = new Date();
  visit.medicines = consultationData.medicines || [];
  visit.diagnosis = consultationData.diagnosis || '';
  await visit.save();

  appointment.status = 'completed';
  await appointment.save();

  return visit;
};

/**
 * Service to auto-create a follow-up appointment.
 * Triggered internally when a visit is completed with follow_up_required = true.
 */
export const createAutoFollowup = async (data, user) => {
  await dbConnect();

  const { visitId, patientId, doctorId, followUpDate, followUpNotes } = data;
  const { clinicId } = user;

  // 1. Duplicate check (Don't create if already exists for this visit)
  const existing = await Appointment.findOne({ linked_visit_id: visitId });
  if (existing) {
    return existing; // Idempotent
  }

  // 2. Fetch doctor/patient names for metadata (UI performance)
  const [doctor, patient] = await Promise.all([
    Doctor.findById(doctorId).select('firstName lastName'),
    Patient.findById(patientId).select('firstName lastName')
  ]);

  // 3. Create Appointment with collision avoidance for timeSlot
  const targetDate = new Date(followUpDate);
  targetDate.setUTCHours(0, 0, 0, 0);

  let slot = '09:00 AM';
  let isOccupied = await Appointment.findOne({ 
    doctorId, 
    appointmentDate: targetDate, 
    timeSlot: slot,
    status: { $in: ['booked', 'scheduled', 'checked_in', 'in_progress'] }
  });

  if (isOccupied) {
    // Generate a unique virtual slot for auto-followups to avoid unique index collisions
    slot = `FU-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
  }

  const newAppointment = await Appointment.create({
    patientId,
    doctorId,
    clinicId,
    appointmentDate: targetDate,
    timeSlot: slot,
    status: 'scheduled',
    type: 'follow_up',
    linked_visit_id: visitId,
    reason: followUpNotes || 'Follow-up Consultation',
    doctorName: doctor ? `Dr. ${doctor.lastName}` : 'Unknown Doctor',
    patientName: patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown Patient'
  });

  console.log(`[AUTO-FOLLOWUP] Created appointment ${newAppointment.appointmentId} for visit ${visitId}`);
  
  return newAppointment;
};
/**
 * Fetch daily appointments for a specific doctor.
 */
export const fetchDoctorDailyAppointments = async (doctorId, date, clinicId) => {
  await dbConnect();

  const queryDate = date ? new Date(date) : new Date();
  const startOfDay = new Date(queryDate);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(queryDate);
  endOfDay.setUTCHours(23, 59, 59, 999);

  console.log(`[DEBUG] Fetching daily appointments for doctor ${doctorId} in clinic ${clinicId} for date ${startOfDay.toISOString()}`);

  const appointments = await Appointment.find({
    doctorId: new mongoose.Types.ObjectId(doctorId),
    clinicId,
    appointmentDate: { $gte: startOfDay, $lte: endOfDay },
    status: { $ne: 'cancelled' }
  })
  .populate('patientId', 'firstName lastName phoneNumber patientId patientCode')
  .sort({ queueNumber: 1, timeSlot: 1 });

  console.log(`[DEBUG] Found ${appointments.length} appointments`);
  return appointments;
};
