import dbConnect from '../src/utils/db.js';
import Appointment from '../src/models/Appointments.js';
import Doctor from '../src/models/Doctor.js';

import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

async function checkClinicId() {
  await dbConnect();
  
  const docs = await Doctor.find({});
  console.log('Doctors:', docs.map(d => ({id: d._id, email: d.email, clinicId: d.clinicId})));
  
  const appts = await Appointment.find({});
  console.log('Appointments:', appts.map(a => ({
    id: a._id, 
    doc: a.doctorId, 
    clinic: a.clinicId, 
    date: a.appointmentDate, 
    time: a.timeSlot,
    status: a.status
  })));
  
  process.exit(0);
}

checkClinicId().catch(console.error);
