import { NextResponse } from 'next/server';
import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';
import { jwtVerify } from 'jose';

export async function GET(request, { params }) {
  try {
    const { clinicId } = await params;
    
    if (!clinicId || clinicId === 'undefined' || clinicId === 'null') {
      return ApiResponse.error('Clinic ID is required', 'MISSING_CLINIC_ID', null, 400);
    }

    // Tenant privacy validation:
    // If authenticated as a clinic, ensure caller is not accessing another clinic's dashboard
    const authHeader = request.headers.get('authorization');
    let authenticatedUser = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1].trim();
      const JWT_SECRET = process.env.JWT_SECRET;
      if (JWT_SECRET) {
        try {
          const secretKey = new TextEncoder().encode(JWT_SECRET);
          const { payload } = await jwtVerify(token, secretKey);
          authenticatedUser = payload;
        } catch (e) {
          // Token invalid or expired
        }
      }
    }

    const headerRole = request.headers.get('x-user-role');
    const headerClinicId = request.headers.get('x-user-clinic-id');
    const headerUserId = request.headers.get('x-user-id');

    const userRole = (authenticatedUser?.role || headerRole || '').toLowerCase();
    const callerClinicId = authenticatedUser?.clinicId || authenticatedUser?.id || headerClinicId || (userRole === 'clinic' ? headerUserId : null);

    if (userRole === 'clinic' && callerClinicId && callerClinicId !== clinicId) {
      return ApiResponse.error('Forbidden - Cross-clinic access attempt', 'FORBIDDEN', null, 403);
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
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

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

    // 6. Doctor Availability for this clinic
    const { data: doctorsData, error: docsError } = await supabase
      .from('doctors')
      .select('id, first_name, last_name, specialty, profile_image, status')
      .eq('clinic_id', clinicId)
      .order('first_name', { ascending: true });

    if (docsError) throw docsError;

    // Fetch leaves for this clinic from today onwards
    const { data: leavesData, error: leavesError } = await supabase
      .from('leaves')
      .select('id, doctor_id, date, reason')
      .eq('clinic_id', clinicId)
      .gte('date', dateStr)
      .order('date', { ascending: true });

    if (leavesError) throw leavesError;

    const leavesByDoctor = {};
    (leavesData || []).forEach(leave => {
      if (!leavesByDoctor[leave.doctor_id]) {
        leavesByDoctor[leave.doctor_id] = [];
      }
      leavesByDoctor[leave.doctor_id].push(leave);
    });

    const doctorAvailability = (doctorsData || []).map(doc => {
      const docLeaves = leavesByDoctor[doc.id] || [];
      const todayLeave = docLeaves.find(l => {
        const lDate = typeof l.date === 'string' ? l.date.split('T')[0] : '';
        return lDate === dateStr;
      });

      const upcomingLeaves = docLeaves
        .filter(l => {
          const lDate = typeof l.date === 'string' ? l.date.split('T')[0] : '';
          return lDate > dateStr;
        })
        .map(l => ({
          date: typeof l.date === 'string' ? l.date.split('T')[0] : l.date,
          reason: l.reason || 'Leave'
        }));

      const isActive = (doc.status || 'active').toLowerCase() === 'active';
      let status = 'available';
      if (!isActive) {
        status = 'inactive';
      } else if (todayLeave) {
        status = 'on_leave';
      } else {
        status = 'available';
      }

      return {
        id: doc.id,
        firstName: doc.first_name || '',
        lastName: doc.last_name || '',
        specialty: doc.specialty || 'General',
        profileImage: doc.profile_image || null,
        status,
        todayLeaveReason: todayLeave ? (todayLeave.reason || 'Personal Leave') : null,
        upcomingLeaves
      };
    });

    return ApiResponse.success({
      stats: {
        totalDoctors: totalDoctors || 0,
        totalReceptionists: totalReceptionists || 0,
        appointmentsToday: appointmentsToday || 0,
        pendingAppointments: pendingAppointments || 0
      },
      appointments: recentAppointments,
      doctorAvailability
    });

  } catch (error) {
    console.error('Clinic Dashboard Error:', error);
    return ApiResponse.error('Internal Server Error', 'CLINIC_DASHBOARD_ERROR', error.message, 500);
  }
}
