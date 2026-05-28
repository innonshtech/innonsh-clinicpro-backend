import { NextResponse } from 'next/server';
import { ApiResponse } from '@/utils/apiResponse';
import dbConnect from '@/utils/db';
import Patient from '@/models/Patient';
import Doctor from '@/models/Doctor';
import Appointments from '@/models/Appointments';
import Billing from '@/models/Billing';

export async function GET() {
  try {
    await dbConnect();

    // 1. Basic Stats
    const totalPatients = await Patient.countDocuments();
    const totalDoctors = await Doctor.countDocuments();
    const totalAppointments = await Appointments.countDocuments();
    
    // Revenue
    const revenueAggr = await Billing.aggregate([
      { $match: { status: 'paid' } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } }
    ]);
    const totalRevenue = revenueAggr.length > 0 ? revenueAggr[0].total : 0;

    const patientFlow = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(new Date().getMonth() - i);
      const monthName = d.toLocaleString('default', { month: 'short' });
      
      const startOfMonth = new Date(d.getFullYear(), d.getMonth(), 1);
      const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0);

      const pCount = await Patient.countDocuments({
        createdAt: { $gte: startOfMonth, $lte: endOfMonth }
      });
      const aCount = await Appointments.countDocuments({
        createdAt: { $gte: startOfMonth, $lte: endOfMonth }
      });

      patientFlow.push({
        month: monthName,
        patients: pCount,
        appointments: aCount
      });
    }

    // 3. Department Distribution
    const deptDistribution = await Doctor.aggregate([
      { $group: { _id: "$specialty", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    const colors = ['#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444'];
    const departmentStats = deptDistribution.map((d, i) => ({
      name: d._id || 'General',
      value: d.count,
      color: colors[i % colors.length]
    }));

    // Convert values to percentages for pie chart display if needed
    const totalDocsForPie = departmentStats.reduce((acc, curr) => acc + curr.value, 0) || 1;
    departmentStats.forEach(d => {
      d.value = Math.round((d.value / totalDocsForPie) * 100);
    });

    // 4. Top Doctors (By most appointments)
    const topDoctorsAggr = await Appointments.aggregate([
      { $group: { _id: "$doctorId", appointmentCount: { $sum: 1 } } },
      { $sort: { appointmentCount: -1 } },
      { $limit: 4 }
    ]);

    const topDoctors = await Promise.all(topDoctorsAggr.map(async (td) => {
      const doc = await Doctor.findById(td._id);
      return {
        id: td._id,
        name: doc ? `Dr. ${doc.firstName} ${doc.lastName}` : 'Unknown',
        specialty: doc ? doc.specialty : 'N/A',
        appointments: td.appointmentCount,
        rating: (Math.random() * (5.0 - 4.2) + 4.2).toFixed(1) // simulated rating
      };
    }));

    // 5. Recent Activities
    const recentAppointments = await Appointments.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('doctorId')
      .populate('patientId');

    const recentActivities = recentAppointments.map((app, index) => ({
      id: app._id || index,
      type: 'appointment',
      message: `Appointment scheduled for ${app.patientId ? app.patientId.firstName : 'Patient'} with Dr. ${app.doctorId ? app.doctorId.lastName : 'Doctor'}`,
      time: new Date(app.createdAt).toLocaleDateString(),
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
}
