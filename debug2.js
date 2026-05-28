import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const StaffSchema = new mongoose.Schema({}, { strict: false });
const Staff = mongoose.model('Staff', StaffSchema);

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);

  const staff = await Staff.find();
  console.log('Staff:', staff.map(r => ({ id: r._id, email: r.email, role: r.role, clinicId: r.clinicId })));

  await mongoose.disconnect();
}

run().catch(console.error);
