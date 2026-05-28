import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const PatientSchema = new mongoose.Schema({}, { strict: false });
const Patient = mongoose.model('Patient', PatientSchema);
const AppointmentSchema = new mongoose.Schema({}, { strict: false });
const Appointment = mongoose.model('Appointment', AppointmentSchema);

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);

  const apptId = '6a140c9c39d012377fd3e791';
  let appt = await Appointment.findOne({ _id: apptId });
  console.log('Appt PatientId:', appt.patientId);

  const patient = await Patient.findOne({ _id: appt.patientId });
  console.log('Patient found:', !!patient);

  await mongoose.disconnect();
}

run().catch(console.error);
