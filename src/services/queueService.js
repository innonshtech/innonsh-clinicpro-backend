import Appointment from '@/models/Appointments';
import dbConnect from '@/utils/db';
import mongoose from 'mongoose';
import AppError from '@/utils/AppError';


/**
 * Service to fetch the live queue for a specific doctor.
 * Filters by today's date and statuses 'checked_in' or 'in_progress'.
 */
export const getDoctorQueue = async (doctorId, user) => {
  await dbConnect();
  
  // 1. Resolve Doctor ID format
  const targetDoctorId = mongoose.Types.ObjectId.isValid(doctorId) 
    ? new mongoose.Types.ObjectId(doctorId)
    : null;

  if (!targetDoctorId) throw new AppError('Invalid Doctor ID format', 400, 'INVALID_ID');


  // 2. Define "Today" time bounds (UTC)
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setUTCHours(23, 59, 59, 999);

  // 3. Fetch all active queue appointments
  const appointments = await Appointment.find({
    doctorId: targetDoctorId,
    clinicId: user.clinicId,
    appointmentDate: { $gte: todayStart, $lte: todayEnd },
    status: { $in: ['checked_in', 'in_progress'] }
  })
    .populate('patientId', 'firstName lastName patientId patientCode phoneNumber gender dateOfBirth')
    .sort({ isEmergency: -1, checkInTime: 1 });

  // 4. Map Dynamic Tokens
  const mappedQueue = appointments.map((app, index) => ({
    appointmentId: app._id,
    patientName: app.patientId ? `${app.patientId.firstName} ${app.patientId.lastName}` : 'Unknown Patient',
    patientId: app.patientId?.patientCode || app.patientId?.patientId || 'N/A',
    tokenNumber: index + 1,
    timeSlot: app.timeSlot,
    status: app.status,
    isEmergency: app.isEmergency
  }));

  const current = mappedQueue.find(app => app.status === 'in_progress') || null;
  const nextList = mappedQueue.filter(app => app.status === 'checked_in');

  return {
    current,
    next: nextList.length > 0 ? nextList[0] : null,
    waitingList: nextList.slice(1)
  };
};
