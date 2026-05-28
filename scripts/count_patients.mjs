import mongoose from 'mongoose';
import dbConnect from '../src/utils/db.js';
import Appointment from '../src/models/Appointments.js';

async function run() {
  await dbConnect();
  const completedAppointments = await Appointment.find({ status: 'completed' });
  const patientIds = [...new Set(completedAppointments.map(a => a.patientId.toString()))];
  console.log(`There are ${patientIds.length} unique patients with completed consultations.`);
  console.log(`Total completed appointments: ${completedAppointments.length}`);
  process.exit(0);
}
run().catch(console.error);
