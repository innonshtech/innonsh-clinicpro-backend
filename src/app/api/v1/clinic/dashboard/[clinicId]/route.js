import { NextResponse } from 'next/server';
import { ApiResponse } from '@/utils/apiResponse';
import dbConnect from '@/utils/db';
import Doctor from '@/models/Doctor';
import Staff from '@/models/Staff';
import Appointment from '@/models/Appointments';

export async function GET(request, { params }) {
  try {
    const { clinicId } = await params;
    
    if (!clinicId || clinicId === 'undefined' || clinicId === 'null') {
      return ApiResponse.error('Clinic ID is required', 'MISSING_CLINIC_ID', null, 400);
    }

    await dbConnect();

    // 1. Total Doctors
    const totalDoctors = await Doctor.countDocuments({ clinicId });

    // 2. Total Receptionists (Staff)
    const totalReceptionists = await Staff.countDocuments({ clinicId });

    // 3. Appointments Today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const appointmentsToday = await Appointment.countDocuments({
      clinicId,
      appointmentDate: { $gte: today, $lt: tomorrow }
    });

    // 4. Pending Appointments Today
    const pendingAppointments = await Appointment.countDocuments({
      clinicId,
      appointmentDate: { $gte: today, $lt: tomorrow },
      status: { $in: ['booked', 'scheduled'] }
    });

    // 5. List of today's appointments (limit to 10 for dashboard)
    const recentAppointmentsData = await Appointment.find({
      clinicId,
      appointmentDate: { $gte: today, $lt: tomorrow }
    })
      .sort({ timeSlot: 1 }) // Sort by time roughly
      .limit(10)
      .populate('doctorId', 'firstName lastName')
      .populate('patientId', 'firstName lastName');

    const recentAppointments = recentAppointmentsData.map((app) => ({
      id: app._id,
      patientName: app.patientId ? `${app.patientId.firstName} ${app.patientId.lastName}` : app.patientName || 'Unknown Patient',
      doctorName: app.doctorId ? `Dr. ${app.doctorId.firstName} ${app.doctorId.lastName}` : app.doctorName || 'Unknown Doctor',
      time: app.timeSlot || new Date(app.appointmentDate).toLocaleTimeString(),
      type: app.type === 'follow_up' ? 'Follow-up' : 'Checkup',
      status: app.status
    }));

    return ApiResponse.success({
      stats: {
        totalDoctors,
        totalReceptionists,
        appointmentsToday,
        pendingAppointments
      },
      appointments: recentAppointments
    });

  } catch (error) {
    console.error('Clinic Dashboard Error:', error);
    return ApiResponse.error('Internal Server Error', 'CLINIC_DASHBOARD_ERROR', error.message, 500);
  }
}
