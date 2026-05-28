import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { ApiResponse } from '@/utils/apiResponse';
import dbConnect from '@/utils/db';
import Visit from '@/models/Visit';

// GET /api/v1/visit/list
export const GET = withErrorHandler(
  withRoles(['doctor', 'admin', 'receptionist'], async (req) => {
    await dbConnect();
    
    const { searchParams } = new URL(req.url);
    const appointmentId = searchParams.get('appointmentId');

    const query = {};
    if (appointmentId) {
      const Appointment = (await import('@/models/Appointments')).default;
      const appointment = await Appointment.findById(appointmentId);
      
      if (!appointment) {
        return ApiResponse.error('Appointment not found', 'NOT_FOUND', [], 404);
      }
      
      if (req.user.clinicId && String(appointment.clinicId) !== String(req.user.clinicId)) {
        return ApiResponse.error('Access Denied', 'FORBIDDEN', [], 403);
      }
      
      query.appointmentId = appointmentId;
    } else if (req.user.role === 'doctor') {
      query.doctorId = req.user.id;
    } else {
      return ApiResponse.error('appointmentId parameter is required', 'VALIDATION_ERROR', [], 400);
    }

    const visits = await Visit.find(query)
    .populate('patientId', 'firstName lastName dateOfBirth gender patientCode')
    .sort({ createdAt: -1 });

    return ApiResponse.success({ visits }, "Visits fetched successfully");
  })
);
