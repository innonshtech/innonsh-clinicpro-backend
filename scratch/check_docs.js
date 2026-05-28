import dbConnect from '../src/utils/db.js';
import Doctor from '../src/models/Doctor.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

async function checkDocs() {
  await dbConnect();
  const count = await Doctor.countDocuments();
  console.log('Doctor count:', count);
  const doctors = await Doctor.find();
  console.log('Doctors:', JSON.stringify(doctors, null, 2));
  process.exit(0);
}

checkDocs();
