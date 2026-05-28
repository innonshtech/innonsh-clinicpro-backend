import * as patientController from '../src/controllers/patientController.js';
import mongoose from 'mongoose';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function verifyRegistration() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Mock request object
    const mockData = {
      firstName: 'Integration',
      lastName: 'Test',
      email: `integ_${Date.now()}@example.com`,
      phoneNumber: `99${Date.now().toString().slice(-8)}`,
      dateOfBirth: '1995-01-01',
      gender: 'Female',
      password: 'SecurePassword123!',
      address: '123 Integration Lane'
    };

    const req = {
      json: async () => mockData
    };

    console.log('⏳ Testing Controller.register...');
    const response = await patientController.register(req);
    const result = await response.json();

    if (result.success) {
      console.log('✅ Registration successful!');
      console.log('📄 Patient Data:', result.data.patient);
      
      // Test Duplicate Phone Number
      console.log('⏳ Testing Duplicate Phone Number...');
      const duplicateResponse = await patientController.register(req);
      const duplicateResult = await duplicateResponse.json();
      
      if (!duplicateResult.success && duplicateResult.errorCode === 'DUPLICATE_ENTRY') {
        console.log('✅ Duplicate phone number check passed!');
      } else {
        console.error('❌ Duplicate check failed:', duplicateResult);
      }

      // Cleanup
      const Patient = mongoose.models.Patient;
      await Patient.deleteOne({ email: mockData.email });
      console.log('✅ Test data cleaned up');
    } else {
      console.error('❌ Registration failed:', result);
    }

  } catch (err) {
    console.error('❌ Verification failed:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

verifyRegistration();
