import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const ApptSchema = new mongoose.Schema({ patientId: mongoose.Schema.Types.ObjectId, doctorId: mongoose.Schema.Types.ObjectId }, { strict: false });
const Appointment = mongoose.model('Appointment', ApptSchema);
const Patient = mongoose.model('Patient', new mongoose.Schema({}, { strict: false }));

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);

  const appointments = await Appointment.find({ doctorId: new mongoose.Types.ObjectId('69e3b2411bfff34671846e73') }).limit(2);
  const enrichedAppointments = await Promise.all(
    appointments.map(async (appt) => {
      const patient = await Patient.findById(appt.patientId);
      return {
        patientId: appt.patientId,
        patientDetails: patient != null
      };
    })
  );
  console.log(enrichedAppointments);

  await mongoose.disconnect();
}

run().catch(console.error);
