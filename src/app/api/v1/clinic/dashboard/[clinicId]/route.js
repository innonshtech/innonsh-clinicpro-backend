import { NextResponse } from 'next/server';
import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';

export async function GET(request, { params }) {
  try {
    const { clinicId } = await params;
    
    if (!clinicId || clinicId === 'undefined' || clinicId === 'null') {
      return ApiResponse.error('Clinic ID is required', 'MISSING_CLINIC_ID', null, 400);
    }

    // 1. Total Doctors
    const { count: totalDoctors } = await supabase
      .from('doctors')
      .select('*', { count: 'exact', head: true })
      .eq('clinic_id', clinicId);

    // 2. Total Receptionists (Staff)
    const { count: totalReceptionists } = await supabase
      .from('staff')
      .select('*', { count: 'exact', head: true })
      .eq('clinic_id', clinicId);

    // 3. Appointments Today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dateStr = today.toISOString().split('T')[0];

    const { count: appointmentsToday } = await supabase
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .eq('appointment_date', dateStr);

    // 4. Pending Appointments Today
    const { count: pendingAppointments } = await supabase
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .eq('appointment_date', dateStr)
      .in('status', ['booked', 'scheduled']);

    // 5. List of today's appointments (limit to 10 for dashboard)
    const { data: recentAppointmentsData, error: apptError } = await supabase
      .from('appointments')
      .select(`
        *,
        doctors (first_name, last_name),
        patients (first_name, last_name)
      `)
      .eq('clinic_id', clinicId)
      .eq('appointment_date', dateStr)
      .order('time_slot', { ascending: true })
      .limit(10);

    if (apptError) throw apptError;

    const recentAppointments = (recentAppointmentsData || []).map((app) => ({
      id: app.id,
      patientName: app.patients ? `${app.patients.first_name} ${app.patients.last_name}` : app.patient_name || 'Unknown Patient',
      doctorName: app.doctors ? `Dr. ${app.doctors.first_name} ${app.doctors.last_name}` : app.doctor_name || 'Unknown Doctor',
      time: app.time_slot || new Date(app.appointment_date).toLocaleTimeString(),
      type: app.type === 'follow_up' ? 'Follow-up' : 'Checkup',
      status: app.status
    }));

    return ApiResponse.success({
      stats: {
        totalDoctors: totalDoctors || 0,
        totalReceptionists: totalReceptionists || 0,
        appointmentsToday: appointmentsToday || 0,
        pendingAppointments: pendingAppointments || 0
      },
      appointments: recentAppointments
    });

  } catch (error) {
    console.error('Clinic Dashboard Error:', error);
    return ApiResponse.error('Internal Server Error', 'CLINIC_DASHBOARD_ERROR', error.message, 500);
  }
}
