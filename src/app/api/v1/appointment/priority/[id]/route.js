import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { supabase } from '@/lib/supabase';
import AppError from '@/utils/AppError';
import { ApiResponse } from '@/utils/apiResponse';

// PUT: /api/v1/appointment/priority/[id]
export const PUT = withErrorHandler(
  withRoles(['admin', 'receptionist'], async (req, { params }) => {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    
    const { isEmergency } = body;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let reqQ = supabase.from('appointments').select('*');
    if (uuidRegex.test(id)) {
      reqQ = reqQ.eq('id', id);
    } else {
      reqQ = reqQ.eq('appointment_id', id);
    }

    const { data: appointment, error: fetchError } = await reqQ.maybeSingle();

    if (fetchError) throw fetchError;

    if (!appointment) {
      throw new AppError('Appointment not found', 404, 'NOT_FOUND');
    }

    if (req.user.clinicId && String(appointment.clinic_id) !== String(req.user.clinicId)) {
      throw new AppError('Access Denied', 403, 'FORBIDDEN');
    }

    const { data: updatedAppt, error: updateError } = await supabase
      .from('appointments')
      .update({ is_emergency: Boolean(isEmergency) })
      .eq('id', appointment.id)
      .select()
      .single();

    if (updateError) throw updateError;
    
    // Remap for frontend
    updatedAppt._id = updatedAppt.id;
    updatedAppt.isEmergency = updatedAppt.is_emergency;

    return ApiResponse.success({ appointment: updatedAppt }, 'Priority status updated successfully');
  })
);

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}
