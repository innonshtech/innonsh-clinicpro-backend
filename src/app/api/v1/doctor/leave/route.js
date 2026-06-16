import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';

// POST: /api/v1/doctor/leave -> Mark a date as leave
export const POST = withErrorHandler(
  withRoles(['doctor', 'admin', 'receptionist'], async (req) => {
    const body = await req.json();
    const { doctorId, date, reason } = body;
    const { clinicId } = req.user;

    if (!doctorId || !date) {
      return ApiResponse.error("Doctor ID and Date are required", "VALIDATION_ERROR", [], 400);
    }

    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    const dateStr = targetDate.toISOString().split('T')[0];

    const { data: leave, error } = await supabase
      .from('leaves')
      .upsert({
        doctor_id: doctorId,
        date: dateStr,
        clinic_id: clinicId,
        reason: reason
      }, { onConflict: 'doctor_id,date' })
      .select()
      .single();

    if (error) throw error;
    
    // Preserve legacy ID formatting
    leave._id = leave.id;

    return ApiResponse.success(leave, "Leave marked successfully");
  })
);

// GET: /api/v1/doctor/leave -> Fetch leaves for a doctor
export const GET = withErrorHandler(
  withRoles(['doctor', 'admin', 'receptionist'], async (req) => {
    const { searchParams } = new URL(req.url);
    const doctorId = searchParams.get('doctorId');

    if (!doctorId) {
      return ApiResponse.error("Doctor ID is required", "VALIDATION_ERROR", [], 400);
    }

    const { data: leaves, error } = await supabase
      .from('leaves')
      .select('*')
      .eq('doctor_id', doctorId)
      .order('date', { ascending: true });

    if (error) throw error;

    const mappedLeaves = (leaves || []).map(l => ({ ...l, _id: l.id }));

    return ApiResponse.success(mappedLeaves, "Leaves fetched successfully");
  })
);

// DELETE: /api/v1/doctor/leave -> Remove a leave
export const DELETE = withErrorHandler(
  withRoles(['doctor', 'admin'], async (req) => {
    const { searchParams } = new URL(req.url);
    const leaveId = searchParams.get('id');

    if (!leaveId) {
      return ApiResponse.error("Leave ID is required", "VALIDATION_ERROR", [], 400);
    }

    const { error } = await supabase
      .from('leaves')
      .delete()
      .eq('id', leaveId);

    if (error) throw error;

    return ApiResponse.success(null, "Leave removed successfully");
  })
);
