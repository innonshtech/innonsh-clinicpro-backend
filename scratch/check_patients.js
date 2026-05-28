import dbConnect from '../src/utils/db.js';
import Patient from '../src/models/Patient.js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

async function checkPatients() {
  await dbConnect();
  const patient = await Patient.findOne();
  if (patient) {
    console.log('Sample Patient ClinicId:', patient.clinicId);
  } else {
    console.log('No patients found.');
  }
  process.exit(0);
}

checkPatients();
