import dbConnect from '../src/utils/db.js';
import Appointment from '../src/models/Appointments.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

async function normalizeDates() {
  await dbConnect();
  
  const appointments = await Appointment.find({});
  console.log(`Checking ${appointments.length} appointments...`);
  
  let updatedCount = 0;
  for (const app of appointments) {
    const oldDate = app.appointmentDate;
    if (!oldDate) continue;
    
    // We want to normalize to the UTC midnight of the day it belongs to in IST
    // (Assuming IST because the 18:30 offset is exactly IST's midnight)
    // Actually, let's just add 6 hours to push any 18:30Z into the next day, then floor to UTC midnight.
    const dateObj = new Date(oldDate);
    dateObj.setUTCHours(dateObj.getUTCHours() + 6); 
    dateObj.setUTCHours(0, 0, 0, 0);
    
    if (oldDate.toISOString() !== dateObj.toISOString()) {
      console.log(`Updating ${app._id}: ${oldDate.toISOString()} -> ${dateObj.toISOString()}`);
      app.appointmentDate = dateObj;
      await app.save();
      updatedCount++;
    }
  }
  
  console.log(`Normalization complete. Updated ${updatedCount} records.`);
  process.exit(0);
}

normalizeDates().catch(console.error);
