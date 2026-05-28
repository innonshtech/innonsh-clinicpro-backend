const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://xpertance:XPERTANCE@cluster0.dnv2io.mongodb.net/Doctor_ERP?retryWrites=true&w=majority';

async function test() {
  try {
    console.log("Connecting to DB...");
    await mongoose.connect(MONGODB_URI);
    console.log("Connected!");

    // Dynamically define schemas to query
    const doctorSchema = new mongoose.Schema({}, { strict: false });
    const leaveSchema = new mongoose.Schema({}, { strict: false });

    const Doctor = mongoose.models.Doctor || mongoose.model('Doctor', doctorSchema, 'doctors');
    const Leave = mongoose.models.Leave || mongoose.model('Leave', leaveSchema, 'leaves');

    console.log("Fetching doctors...");
    const doctors = await Doctor.find();
    console.log("Found doctors:", doctors.length);

    console.log("Fetching leaves...");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const leaves = await Leave.find();
    console.log("Found leaves:", leaves.length);

    console.log("Querying leaves with findOne...");
    if (doctors.length > 0) {
      const leaveRecord = await Leave.findOne({
        doctorId: doctors[0]._id,
        date: today
      });
      console.log("Leave record check success!");
    }

    console.log("ALL DB QUERIES COMPLETED SUCCESSFULLY!");
  } catch (err) {
    console.error("DB TEST ERROR STACK:", err.stack);
    console.error("DB TEST ERROR MESSAGE:", err.message);
  } finally {
    await mongoose.disconnect();
  }
}

test();
