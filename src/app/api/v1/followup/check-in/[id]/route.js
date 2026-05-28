import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import * as appointmentController from '@/controllers/appointmentController';

/**
 * PUT /api/v1/followup/check-in/[id]
 * Follow-up Patient Check-in
 * Marks a follow-up appointment as checked-in and assigns a queue number.
 */
export const PUT = withErrorHandler(
  withRoles(['admin', 'receptionist'], async (req, { params }) => {
    // Standardize params for the controller
    const context = { params: { id: params.id } };
    return await appointmentController.checkInAppointment(req, context);
  })
);
