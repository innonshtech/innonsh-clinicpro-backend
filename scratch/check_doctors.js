import mongoose from 'mongoose';
import Doctor from './src/models/Doctor.js';
import dbConnect from './src/utils/db.js';

async function checkDoctors() {
  await dbConnect();
  const doctors = await Doctor.find({});
  console.log(`Found ${doctors.length} doctors.`);
  doctors.forEach(doc => {
    console.log(`Doctor: ${doc.firstName} ${doc.lastName}`);
    console.log(`  ClinicId: ${doc.clinicId}`);
    console.log(`  Available: ${JSON.stringify(doc.available)}`);
    console.log(`  AvailableDays: ${JSON.stringify(doc.availableDays)}`);
  });
  process.exit(0);
}

checkDoctors();
