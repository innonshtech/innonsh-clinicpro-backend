import dbConnect from '../src/utils/db.js';
import Appointment from '../src/models/Appointments.js';
import Patient from '../src/models/Patient.js';
import Doctor from '../src/models/Doctor.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

async function checkData() {
  await dbConnect();
  const doctors = await Doctor.find({});
  console.log('Doctors in DB:', doctors.map(d => ({id: d._id, email: d.email})));

  const patients = await Patient.find({});
  console.log('Patients in DB:', patients.map(p => ({id: p._id, name: p.firstName})));

  const appts = await Appointment.find({});
  console.log('Appointments in DB:', appts.map(a => ({
      id: a._id, 
      doctorId: a.doctorId, 
      patientId: a.patientId, 
      date: a.appointmentDate
  })));

  process.exit(0);
}

checkData().catch(console.error);
