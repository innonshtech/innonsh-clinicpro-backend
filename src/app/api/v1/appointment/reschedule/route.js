import { NextResponse } from 'next/server';
import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import Appointment from '@/models/Appointments';
import dbConnect from '@/utils/db';

export const PUT = withErrorHandler(
  withRoles(['admin', 'receptionist', 'doctor'], async (req) => {
    await dbConnect();
    const body = await req.json();
    const { appointmentId, appointmentDate, timeSlot } = body;

    if (!appointmentId || !appointmentDate || !timeSlot) {
      return ApiResponse.error("Missing required fields", "VALIDATION_ERROR", [], 400);
    }

    const reqDate = new Date(appointmentDate);
    reqDate.setUTCHours(0, 0, 0, 0);

    const updatedAppt = await Appointment.findByIdAndUpdate(
      appointmentId,
      { appointmentDate: reqDate, timeSlot },
      { new: true }
    );

    if (!updatedAppt) {
      return ApiResponse.error("Appointment not found", "NOT_FOUND", [], 404);
    }

    return ApiResponse.success({ appointment: updatedAppt }, "Appointment rescheduled successfully");
  })
);
