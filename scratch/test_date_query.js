import dbConnect from '../src/utils/db.js';
import { fetchDoctorDailyAppointments } from '../src/services/appointmentService.js';
import dotenv from 'dotenv';
import Appointment from '../src/models/Appointments.js';
import mongoose from 'mongoose';
dotenv.config({ path: '.env' });

async function testFetch() {
  await dbConnect();
  const doctorId = '69e07658fb082785558c40e8';
  const clinicId = '69d60484767b1f86a9d9d988';
  
  // Try passing today's date
  const dateStr = new Date().toISOString().split('T')[0];
  console.log("Using dateStr:", dateStr);
  
  const appts = await fetchDoctorDailyAppointments(doctorId, dateStr, clinicId);
  console.log("Found appointments:", appts.length);
  
  // Try passing the exact Date object matching the DB
  const exactDate = new Date('2026-04-15T18:30:00.000Z');
  console.log("Using exactDate:", exactDate);
  const dbAppts = await Appointment.find({
      doctorId: new mongoose.Types.ObjectId(doctorId),
      appointmentDate: exactDate,
      clinicId
  });
  console.log("Found with exact UTC direct query:", dbAppts.length);
  
  const dbAppts2 = await Appointment.find({
      doctorId: new mongoose.Types.ObjectId(doctorId),
      appointmentDate: new Date('2026-04-16T00:00:00.000Z'),
      clinicId
  });
  console.log("Found with exact UTC direct query for 16th midnight UTC:", dbAppts2.length);

  process.exit(0);
}

testFetch().catch(console.error);
