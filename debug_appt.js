import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const AppointmentSchema = new mongoose.Schema({}, { strict: false });
const Appointment = mongoose.model('Appointment', AppointmentSchema);
const VisitSchema = new mongoose.Schema({}, { strict: false });
const Visit = mongoose.model('Visit', VisitSchema);

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);

  const apptId = '6a140c9c39d012377fd3e791';
  
  // Try to find the appointment by exactly this ID (might be _id or appointmentId)
  let appt = await Appointment.findOne({ _id: apptId });
  if (!appt) appt = await Appointment.findOne({ appointmentId: apptId });
  
  console.log('Appointment:', appt);

  if (appt) {
    const visit = await Visit.findOne({ appointmentId: appt._id });
    console.log('Visit:', visit);
  } else {
    // maybe it's not the exact string
    const all = await Appointment.find().limit(5);
    console.log('Sample Appts:', all.map(a => a._id));
  }

  await mongoose.disconnect();
}

run().catch(console.error);
