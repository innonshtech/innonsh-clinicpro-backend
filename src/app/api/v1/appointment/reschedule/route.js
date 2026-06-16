import { NextResponse } from 'next/server';
import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { supabase } from '@/lib/supabase';

export const PUT = withErrorHandler(
  withRoles(['admin', 'receptionist', 'doctor'], async (req) => {
    const body = await req.json();
    const { appointmentId, appointmentDate, timeSlot } = body;

    if (!appointmentId || !appointmentDate || !timeSlot) {
      return ApiResponse.error("Missing required fields", "VALIDATION_ERROR", [], 400);
    }

    const reqDate = new Date(appointmentDate);
    const dateStr = reqDate.toISOString().split('T')[0];

    const { data: updatedAppt, error } = await supabase
      .from('appointments')
      .update({ appointment_date: dateStr, time_slot: timeSlot })
      .eq('id', appointmentId)
      .select()
      .maybeSingle();

    if (error) {
      console.error("Supabase update error:", error);
      return ApiResponse.error("Database error", "DB_ERROR", error.message, 500);
    }

    if (!updatedAppt) {
      return ApiResponse.error("Appointment not found", "NOT_FOUND", [], 404);
    }

    // Map back for frontend compatibility
    updatedAppt._id = updatedAppt.id;
    updatedAppt.appointmentDate = updatedAppt.appointment_date;
    updatedAppt.timeSlot = updatedAppt.time_slot;

    return ApiResponse.success({ appointment: updatedAppt }, "Appointment rescheduled successfully");
  })
);
