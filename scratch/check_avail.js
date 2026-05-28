import dbConnect from '../src/utils/db.js';
import Availability from '../src/models/Availability.js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

async function checkAvailability() {
  await dbConnect();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const avail = await Availability.findOne({ date: today });
  console.log('Availability for today:', JSON.stringify(avail, null, 2));
  process.exit(0);
}

checkAvailability();
