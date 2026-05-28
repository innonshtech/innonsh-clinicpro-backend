import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const PatientSchema = new mongoose.Schema({ clinicId: String, firstName: String, lastName: String }, { strict: false });
const Patient = mongoose.model('Patient', PatientSchema);

const DoctorSchema = new mongoose.Schema({ clinicId: String, firstName: String, lastName: String }, { strict: false });
const Doctor = mongoose.model('Doctor', DoctorSchema);

const ApptSchema = new mongoose.Schema({ patientId: mongoose.Schema.Types.ObjectId, doctorId: mongoose.Schema.Types.ObjectId }, { strict: false });
const Appointment = mongoose.model('Appointment', ApptSchema);

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');

  const docs = await Doctor.find({});
  console.log('Doctors:', docs.map(d => ({ id: d._id, name: d.firstName + ' ' + d.lastName, clinicId: d.clinicId })));

  const patients = await Patient.find({});
  console.log('Total Patients:', patients.length);
  console.log('Patients sample:', patients.slice(0, 3).map(p => ({ id: p._id, name: p.firstName + ' ' + p.lastName, clinicId: p.clinicId })));

  const appts = await Appointment.find({});
  console.log('Total Appts:', appts.length);
  console.log('Appts sample:', appts.slice(0, 3).map(a => ({ id: a._id, patientId: a.patientId, doctorId: a.doctorId })));

  await mongoose.disconnect();
}

run().catch(console.error);
