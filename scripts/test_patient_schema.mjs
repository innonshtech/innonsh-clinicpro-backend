import mongoose from 'mongoose';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { patientRegistrationSchema } from '../src/validations/userValidation.js';
import Patient from '../src/models/Patient.js';

// Load .env
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function testSchema() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // 1. Test Validation
    const testData = {
      firstName: "Test",
      lastName: "Patient",
      email: `test_${Date.now()}@example.com`,
      phoneNumber: "1234567890",
      dateOfBirth: "1990-01-01",
      gender: "Male",
      password: "Password123!",
      bloodGroup: "O+",
      emergencyContact: "9876543210"
    };

    const parsed = patientRegistrationSchema.safeParse(testData);
    if (!parsed.success) {
      console.error('❌ Validation failed:', parsed.error.format());
      return;
    }
    console.log('✅ Validation passed');

    // 2. Test Model Creation
    const newPatient = await Patient.create(parsed.data);
    console.log('✅ Patient created in DB');
    console.log('📄 Patient ID (UUID):', newPatient.patientId);
    console.log('📄 Created At:', newPatient.createdAt);

    // 3. Clean up
    await Patient.deleteOne({ _id: newPatient._id });
    console.log('✅ Test patient cleaned up');

  } catch (err) {
    console.error('❌ Test failed:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

testSchema();
