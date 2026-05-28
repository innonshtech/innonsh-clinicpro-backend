import mongoose from 'mongoose';
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI;

const staffSchema = new mongoose.Schema({
  name: String,
  email: String,
  role: String,
}, { strict: false });

const Staff = mongoose.models.Staff || mongoose.model('Staff', staffSchema);

const appointmentSchema = new mongoose.Schema({
  status: String,
}, { strict: false });

const Appointment = mongoose.models.Appointment || mongoose.model('Appointment', appointmentSchema);

async function run() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to DB');

    const receptionists = await Staff.find({ role: 'receptionist' });
    console.log('Receptionists:', receptionists.map(r => ({ name: r.name, email: r.email })));

    const completedAppt = await Appointment.findOne({ status: 'completed' });
    if (completedAppt) {
      console.log('Found completed appointment:', completedAppt._id);
    } else {
      console.log('No completed appointments found');
    }

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
