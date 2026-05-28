import { ApiResponse } from '@/utils/apiResponse';
import * as followupService from '@/services/followupService';
import { followupListQuerySchema } from '@/validations/userValidation';
import dbConnect from '@/utils/db';

/**
 * Controller to handle fetching follow-up appointments.
 */
export const listFollowups = async (req) => {
  await dbConnect();
  
  const { searchParams } = new URL(req.url);
  const query = Object.fromEntries(searchParams.entries());

  // 1. Validate request
  const parsed = followupListQuerySchema.safeParse(query);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message || 'Validation failed';
    return ApiResponse.error(firstError, 'VALIDATION_ERROR', parsed.error.format(), 400);
  }

  try {
    // 2. Call service
    const data = await followupService.getFollowupList(parsed.data, req.user);

    // 3. Format response to match Ticket 5 requirements + Ticket 6 (patient_id)
    const formattedFollowups = data.appointments.map(app => ({
      appointment_id: app._id,
      patient_id: app.patientId?._id || null,
      patient_name: app.patientId ? `${app.patientId.firstName} ${app.patientId.lastName}` : app.patientName,
      doctor_name: app.doctorId ? `Dr. ${app.doctorId.lastName}` : app.doctorName,
      date: app.appointmentDate ? new Date(app.appointmentDate).toISOString().split('T')[0] : null,
      type: app.type,
      status: app.status
    }));

    // Return the formatted list within the standard ApiResponse wrapper
    return ApiResponse.success(formattedFollowups, "Follow-up list fetched successfully");
  } catch (error) {
    if (error.statusCode) {
      return ApiResponse.error(
        error.message,
        error.code || 'ERROR',
        [],
        error.statusCode
      );
    }

    console.error('Error in listFollowups controller:', error);
    return ApiResponse.error(
      'Internal server error',
      'INTERNAL_ERROR',
      [],
      500
    );
  }
};
