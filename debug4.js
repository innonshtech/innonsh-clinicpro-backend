import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const ApptSchema = new mongoose.Schema({ status: String, doctorId: mongoose.Schema.Types.ObjectId }, { strict: false });
const Appointment = mongoose.model('Appointment', ApptSchema);

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);

  const appts = await Appointment.find({ doctorId: new mongoose.Types.ObjectId('69e3b2411bfff34671846e73') });
  console.log('Appts status counts:');
  const counts = {};
  appts.forEach(a => { counts[a.status] = (counts[a.status] || 0) + 1; });
  console.log(counts);

  await mongoose.disconnect();
}

run().catch(console.error);
