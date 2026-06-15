/**
 * migrate-doctors.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { createClient } from '@supabase/supabase-js';
import { toUUID } from './utils';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const Doctor = mongoose.models.Doctor || mongoose.model('Doctor', new mongoose.Schema({}, { strict: false }));

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const doctors = await Doctor.find({}).lean();
  let migrated = 0, skipped = 0, errors = 0;

  for (const doc of doctors as any[]) {
    try {
      const id = toUUID(doc._id.toString());
      if (!id) continue;
      const { data: existing } = await supabase.from('doctors').select('id').eq('id', id).maybeSingle();
      if (existing) { skipped++; continue; }

      const { error } = await supabase.from('doctors').insert([{
        id,
        clinic_id: toUUID(doc.clinicId),
        first_name: doc.firstName,
        last_name: doc.lastName,
        profile_image: doc.profileImage || null,
        date_of_birth: doc.dateOfBirth || null,
        gender: doc.gender || null,
        email: doc.email,
        password: doc.password,
        home_address: doc.homeAddress || null,
        phone: doc.phone || null,
        specialty: doc.specialty || null,
        sup_speciality: doc.supSpeciality || null,
        identity_proof: doc.identityProof || null,
        degree_certificate: doc.degreeCertificate || null,
        experience: doc.experience || 0,
        consultant_fee: doc.consultantFee || null,
        qualifications: doc.qualifications || [],
        license_number: doc.licenseNumber || null,
        session_time: doc.sessionTime || null,
        hospital: doc.hospital || null,
        hospital_address: doc.hospitalAddress || null,
        hospital_number: doc.hospitalNumber || null,
        is_verified: doc.isVerified || false,
        status: doc.status || null,
        role: doc.role || 'doctor',
        available_days: doc.availableDays || doc.available?.days || [],
        available_time: doc.availableTime || doc.available?.time || null,
        available: doc.available || null,
        created_at: doc.createdAt?.toISOString() || new Date().toISOString(),
        updated_at: doc.updatedAt?.toISOString() || new Date().toISOString(),
      }]);

      if (error) errors++; else migrated++;
    } catch (err: any) { errors++; }
  }

  console.log(`✅ Doctors: Migrated: ${migrated} | Skipped: ${skipped} | Errors: ${errors}`);
  await mongoose.disconnect();
}
main().catch(() => process.exit(1));
