import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import Appointment from '@/models/Appointments';
import AppError from '@/utils/AppError';
import { ApiResponse } from '@/utils/apiResponse';
import dbConnect from '@/utils/db';

// PUT: /api/v1/appointment/priority/[id]
export const PUT = withErrorHandler(
  withRoles(['admin', 'receptionist'], async (req, { params }) => {
    await dbConnect();
    const { id } = params;
    const body = await req.json().catch(() => ({}));
    
    const { isEmergency } = body;

    const appointment = await Appointment.findOne({
      $or: [
        { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null },
        { appointmentId: id }
      ].filter(Boolean)
    });

    if (!appointment) {
      throw new AppError('Appointment not found', 404, 'NOT_FOUND');
    }

    if (req.user.clinicId && String(appointment.clinicId) !== String(req.user.clinicId)) {
      throw new AppError('Access Denied', 403, 'FORBIDDEN');
    }

    appointment.isEmergency = Boolean(isEmergency);
    await appointment.save();

    return ApiResponse.success({ appointment }, 'Priority status updated successfully');
  })
);

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}
