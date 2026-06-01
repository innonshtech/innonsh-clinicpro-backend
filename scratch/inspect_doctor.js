const mongoose = require('mongoose');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
const DB_URI = process.env.MONGODB_URI;

async function checkDoctor() {
  try {
    await mongoose.connect(DB_URI);
    console.log("Connected to DB");

    const Doctor = mongoose.model('Doctor', new mongoose.Schema({
      firstName: String,
      lastName: String,
      available: Object,
      sessionTime: String
    }), 'doctors');

    const doctor = await Doctor.findOne({ firstName: /mayur/i });
    if (doctor) {
      console.log("Found Doctor:", doctor.firstName, doctor.lastName);
      console.log("Availability Object:", JSON.stringify(doctor.available, null, 2));
      console.log("Session Time:", doctor.sessionTime);
    } else {
      console.log("Doctor Mayur not found");
      const all = await Doctor.find().limit(5);
      console.log("First 5 doctors names:", all.map(d => d.firstName));
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkDoctor();
