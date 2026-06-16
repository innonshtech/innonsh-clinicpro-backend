import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';
import { withRoles } from '@/utils/authGuard';

export const GET = withRoles(['admin'], async (req) => {
  try {
    // 1. Basic Stats
    const [{ count: totalPatients }, { count: totalDoctors }, { count: totalAppointments }, { data: billingData }] = await Promise.all([
      supabase.from('patients').select('*', { count: 'exact', head: true }),
      supabase.from('doctors').select('*', { count: 'exact', head: true }),
      supabase.from('appointments').select('*', { count: 'exact', head: true }),
      supabase.from('billings').select('total_amount').eq('status', 'paid')
    ]);

    const totalRevenue = (billingData || []).reduce((acc, curr) => acc + (curr.total_amount || 0), 0);

    const patientFlow = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(new Date().getMonth() - i);
      const monthName = d.toLocaleString('default', { month: 'short' });
      
      const startOfMonth = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
      const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString();

      const [{ count: pCount }, { count: aCount }] = await Promise.all([
        supabase.from('patients').select('*', { count: 'exact', head: true }).gte('created_at', startOfMonth).lte('created_at', endOfMonth),
        supabase.from('appointments').select('*', { count: 'exact', head: true }).gte('created_at', startOfMonth).lte('created_at', endOfMonth)
      ]);

      patientFlow.push({
        month: monthName,
        patients: pCount || 0,
        appointments: aCount || 0
      });
    }

    // 3. Department Distribution
    const { data: doctorsData } = await supabase.from('doctors').select('specialty');
    const deptCount = {};
    (doctorsData || []).forEach(doc => {
      const spec = doc.specialty || 'General';
      deptCount[spec] = (deptCount[spec] || 0) + 1;
    });

    const deptDistribution = Object.keys(deptCount)
      .map(key => ({ _id: key, count: deptCount[key] }))
      .sort((a, b) => b.count - a.count);

    const colors = ['#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444'];
    const departmentStats = deptDistribution.map((d, i) => ({
      name: d._id || 'General',
      value: d.count,
      color: colors[i % colors.length]
    }));

    const totalDocsForPie = departmentStats.reduce((acc, curr) => acc + curr.value, 0) || 1;
    departmentStats.forEach(d => {
      d.value = Math.round((d.value / totalDocsForPie) * 100);
    });

    // 4. Top Doctors (By most appointments)
    const { data: allAppointments } = await supabase.from('appointments').select('doctor_id');
    const doctorApptCount = {};
    (allAppointments || []).forEach(app => {
      if (app.doctor_id) {
        doctorApptCount[app.doctor_id] = (doctorApptCount[app.doctor_id] || 0) + 1;
      }
    });

    const topDoctorIds = Object.keys(doctorApptCount)
      .sort((a, b) => doctorApptCount[b] - doctorApptCount[a])
      .slice(0, 4);

    const topDoctors = await Promise.all(topDoctorIds.map(async (docId) => {
      const { data: doc } = await supabase.from('doctors').select('first_name, last_name, specialty').eq('id', docId).maybeSingle();
      return {
        id: docId,
        name: doc ? `Dr. ${doc.first_name} ${doc.last_name}` : 'Unknown',
        specialty: doc ? doc.specialty : 'N/A',
        appointments: doctorApptCount[docId],
        rating: (Math.random() * (5.0 - 4.2) + 4.2).toFixed(1) // simulated rating
      };
    }));

    // 5. Recent Activities
    const { data: recentAppointmentsData } = await supabase
      .from('appointments')
      .select('id, created_at, patients:patient_id (first_name, last_name), doctors:doctor_id (last_name)')
      .order('created_at', { ascending: false })
      .limit(5);

    const recentActivities = (recentAppointmentsData || []).map((app, index) => ({
      id: app.id || index,
      type: 'appointment',
      message: `Appointment scheduled for ${app.patients ? app.patients.first_name : 'Patient'} with Dr. ${app.doctors ? app.doctors.last_name : 'Doctor'}`,
      time: new Date(app.created_at).toLocaleDateString(),
    }));

    return ApiResponse.success({
      stats: {
        totalPatients,
        totalDoctors,
        totalAppointments,
        totalRevenue
      },
      patientFlow,
      departmentStats,
      topDoctors,
      recentActivities
    });

  } catch (error) {
    console.error('Analytics Error:', error);
    return ApiResponse.error('Internal Server Error', 'ANALYTICS_ERROR', error.message, 500);
  }
});
