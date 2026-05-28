import dbConnect from '../src/utils/db.js';
import Staff from '../src/models/Reciptionist.js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

async function checkStaff() {
  await dbConnect();
  const staff = await Staff.find();
  console.log('Staff members:', JSON.stringify(staff, null, 2));
  process.exit(0);
}

checkStaff();
