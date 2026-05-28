import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env from project root
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in .env');
  process.exit(1);
}

// ── Schemas (inline to avoid import issues) ──────────────────────

const adminSchema = new mongoose.Schema({
  name: String,
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, required: true },
}, { timestamps: true });

const clinicSchema = new mongoose.Schema({
  clinicName: { type: String, required: true },
  clinicType: { type: String, required: true },
  description: String,
  registrationNumber: { type: String, required: true, unique: true },
  taxId: { type: String, required: true },
  specialties: { type: [String], default: [] },
  logo: String,
  website: String,
  email: String,
  phone: String,
  password: String,
  images: [String],
  address: String,
  city: String,
  state: String,
  postalCode: String,
  country: String,
  role: { type: String, default: 'clinic' },
  licenseDocument: Object,
  gstDocument: Object,
  licenseDocumentUrl: String,
  rejectionReason: String,
  gstDocumentUrl: String,
  is24x7: { type: Boolean, default: false },
  status: { type: String, default: 'pending' },
  openingHours: {
    monday:    { open: { type: String, default: '' }, close: { type: String, default: '' } },
    tuesday:   { open: { type: String, default: '' }, close: { type: String, default: '' } },
    wednesday: { open: { type: String, default: '' }, close: { type: String, default: '' } },
    thursday:  { open: { type: String, default: '' }, close: { type: String, default: '' } },
    friday:    { open: { type: String, default: '' }, close: { type: String, default: '' } },
    saturday:  { open: { type: String, default: '' }, close: { type: String, default: '' } },
    sunday:    { open: { type: String, default: '' }, close: { type: String, default: '' } },
  },
}, { timestamps: true });

const Admin = mongoose.model('Admin', adminSchema);
const Clinic = mongoose.model('Clinic', clinicSchema);

// ── Seed Data ────────────────────────────────────────────────────

async function seed() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // ── 1. Create Super Admin ──
    const existingAdmin = await Admin.findOne({ email: 'admin@healthbyte.com' });
    if (existingAdmin) {
      console.log('⚠️  Admin already exists, skipping...');
    } else {
      const hashedPassword = await bcrypt.hash('Admin@123', 10);
      await Admin.create({
        name: 'Super Admin',
        email: 'admin@healthbyte.com',
        password: hashedPassword,
        role: 'admin',
      });
      console.log('✅ Admin created:');
      console.log('   Email:    admin@healthbyte.com');
      console.log('   Password: Admin@123');
    }

    // ── 2. Create a Clinic (approved) ──
    const existingClinic = await Clinic.findOne({ email: 'clinic@healthbyte.com' });
    if (existingClinic) {
      console.log('⚠️  Clinic already exists, skipping...');
    } else {
      await Clinic.create({
        clinicName: 'HealthByte Medical Center',
        clinicType: 'multispecialty',
        description: 'A full-service multispecialty clinic providing comprehensive healthcare.',
        registrationNumber: 'HB-CLINIC-001',
        taxId: 'GSTIN12345678',
        specialties: ['General Medicine', 'Cardiology', 'Dermatology', 'Pediatrics'],
        email: 'clinic@healthbyte.com',
        phone: '9876543210',
        password: 'Clinic@123',
        address: '123 Main Street',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400001',
        country: 'India',
        role: 'clinic',
        status: 'approved',
        is24x7: false,
        openingHours: {
          monday:    { open: '09:00', close: '18:00' },
          tuesday:   { open: '09:00', close: '18:00' },
          wednesday: { open: '09:00', close: '18:00' },
          thursday:  { open: '09:00', close: '18:00' },
          friday:    { open: '09:00', close: '18:00' },
          saturday:  { open: '10:00', close: '14:00' },
          sunday:    { open: '', close: '' },
        },
      });
      console.log('✅ Clinic created:');
      console.log('   Email:    clinic@healthbyte.com');
      console.log('   Password: Clinic@123');
    }

    console.log('\n🎉 Seeding complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Admin Login:  admin@healthbyte.com / Admin@123');
    console.log('  Clinic Login: clinic@healthbyte.com / Clinic@123');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (err) {
    console.error('❌ Seeding failed:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

seed();
