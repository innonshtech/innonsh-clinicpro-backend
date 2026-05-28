import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { ApiResponse } from '@/utils/apiResponse';
import Leave from '@/models/Leave';
import dbConnect from '@/utils/db';
import mongoose from 'mongoose';

// POST: /api/v1/doctor/leave -> Mark a date as leave
export const POST = withErrorHandler(
  withRoles(['doctor', 'admin', 'receptionist'], async (req) => {
    await dbConnect();
    const body = await req.json();
    const { doctorId, date, reason } = body;
    const { clinicId } = req.user;

    if (!doctorId || !date) {
      return ApiResponse.error("Doctor ID and Date are required", "VALIDATION_ERROR", [], 400);
    }

    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    const leave = await Leave.findOneAndUpdate(
      { doctorId: new mongoose.Types.ObjectId(doctorId), date: targetDate },
      { clinicId, reason },
      { upsert: true, new: true }
    );

    return ApiResponse.success(leave, "Leave marked successfully");
  })
);

// GET: /api/v1/doctor/leave -> Fetch leaves for a doctor
export const GET = withErrorHandler(
  withRoles(['doctor', 'admin', 'receptionist'], async (req) => {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const doctorId = searchParams.get('doctorId');

    if (!doctorId) {
      return ApiResponse.error("Doctor ID is required", "VALIDATION_ERROR", [], 400);
    }

    const leaves = await Leave.find({
      doctorId: new mongoose.Types.ObjectId(doctorId)
    }).sort({ date: 1 });

    return ApiResponse.success(leaves, "Leaves fetched successfully");
  })
);

// DELETE: /api/v1/doctor/leave -> Remove a leave
export const DELETE = withErrorHandler(
  withRoles(['doctor', 'admin'], async (req) => {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const leaveId = searchParams.get('id');

    if (!leaveId) {
      return ApiResponse.error("Leave ID is required", "VALIDATION_ERROR", [], 400);
    }

    await Leave.findByIdAndDelete(leaveId);
    return ApiResponse.success(null, "Leave removed successfully");
  })
);
