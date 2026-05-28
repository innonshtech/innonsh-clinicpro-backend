import Appointment from '@/models/Appointments';
import dbConnect from '@/utils/db';
import AppError from '@/utils/AppError';

/**
 * Service to fetch follow-up appointments for reception.
 */
export const getFollowupList = async (filters, user) => {
  await dbConnect();
  
  const { page = 1, limit = 10, date, doctorId } = filters;
  
  if (!user.clinicId) {
    throw new AppError('Clinic ID missing from user context', 401, 'UNAUTHORIZED');
  }

  // 1. Build Query
  const query = {
    clinicId: user.clinicId,
    type: 'follow_up',
    status: { $in: ['scheduled', 'booked'] } // Show upcoming/unconfirmed follow-ups
  };

  if (date) {
    const searchDate = new Date(date);
    searchDate.setUTCHours(0, 0, 0, 0);
    const endDate = new Date(date);
    endDate.setUTCHours(23, 59, 59, 999);
    query.appointmentDate = { $gte: searchDate, $lte: endDate };
  } else {
    // Default: Show future follow-ups starting from today UTC
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    query.appointmentDate = { $gte: today };
  }

  if (doctorId) {
    query.doctorId = doctorId;
  }

  // 2. Execute with Pagination
  const skip = (page - 1) * limit;
  
  const [appointments, total] = await Promise.all([
    Appointment.find(query)
      .populate('patientId', 'firstName lastName patientId phoneNumber')
      .populate('doctorId', 'firstName lastName specialty')
      .sort({ appointmentDate: 1 })
      .skip(skip)
      .limit(limit),
    Appointment.countDocuments(query)
  ]);

  return {
    appointments,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  };
};
