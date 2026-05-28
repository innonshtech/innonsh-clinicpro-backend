import mongoose from 'mongoose';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';

// Load .env
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in .env');
  process.exit(1);
}

async function migrate() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Define Counter Schema (for patientCode sequence)
    const counterSchema = new mongoose.Schema({
      _id: String,
      seq: Number
    });
    const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

    // Define Patient Schema (minimal for migration)
    const patientSchema = new mongoose.Schema({
      patientId: String,
      patientCode: String,
      firstName: String,
      lastName: String,
      email: String,
      phone: String, // Old field
      phoneNumber: String, // New field
      bloodType: String, // Old field
      bloodGroup: String, // New field
    }, { strict: false });

    const Patient = mongoose.models.Patient || mongoose.model('Patient', patientSchema);

    // 1. Rename fields and generate patientId if missing
    const patients = await Patient.find({ 
      $or: [
        { patientId: { $exists: false } },
        { patientCode: { $exists: false } },
        { phone: { $exists: true } },
        { bloodType: { $exists: true } }
      ]
    });

    console.log(`🔍 Found ${patients.length} patients needing migration.`);

    for (const patient of patients) {
      const updates = {};
      
      if (!patient.patientId) {
        updates.patientId = crypto.randomUUID();
      }

      if (!patient.patientCode) {
        const counter = await Counter.findByIdAndUpdate(
          { _id: 'patient_code' },
          { $inc: { seq: 1 } },
          { new: true, upsert: true }
        );
        updates.patientCode = `PAT-${String(counter.seq).padStart(6, '0')}`;
      }
      
      if (patient.phone && !patient.phoneNumber) {
        updates.phoneNumber = patient.phone;
        updates.$unset = { phone: "" };
      }
      
      if (patient.bloodType && !patient.bloodGroup) {
        updates.bloodGroup = patient.bloodType;
        updates.$unset = updates.$unset ? { ...updates.$unset, bloodType: "" } : { bloodType: "" };
      }

      await Patient.updateOne({ _id: patient._id }, updates);
      console.log(`✅ Migrated patient: ${patient.email || patient._id}`);
    }

    // 2. Ensure indexes
    console.log('⏳ Ensuring indexes...');
    await Patient.collection.createIndex({ patientId: 1 }, { unique: true });
    await Patient.collection.createIndex({ patientCode: 1 }, { unique: true });
    await Patient.collection.createIndex({ phoneNumber: 1 });
    await Patient.collection.createIndex({ email: 1 }, { unique: true });
    console.log('✅ Indexes verified.');

    console.log('\n🎉 Migration complete!');

  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

migrate();
