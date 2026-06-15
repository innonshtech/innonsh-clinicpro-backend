/**
 * migrate-patients.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { createClient } from '@supabase/supabase-js';
import { toUUID } from './utils';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const Patient = mongoose.models.Patient || mongoose.model('Patient', new mongoose.Schema({}, { strict: false }));

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const patients = await Patient.find({}).lean();
  let migrated = 0, skipped = 0, errors = 0, maxSeq = 0;

  for (const doc of patients as any[]) {
    try {
      const id = toUUID(doc._id.toString());
      if (!id) continue;
      const { data: existing } = await supabase.from('patients').select('id').eq('id', id).maybeSingle();
      if (existing) { skipped++; continue; }

      if (doc.patientCode) {
        const seq = parseInt(doc.patientCode.replace('PAT-', ''), 10);
        if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
      }

      const { error } = await supabase.from('patients').insert([{
        id,
        clinic_id: toUUID(doc.clinicId),
        patient_code: doc.patientCode || null,
        first_name: doc.firstName,
        last_name: doc.lastName,
        date_of_birth: doc.dateOfBirth,
        gender: doc.gender,
        phone_number: doc.phoneNumber,
        email: doc.email,
        address: doc.address || null,
        city: doc.city || null,
        state: doc.state || null,
        zip_code: doc.zipCode || null,
        blood_group: doc.bloodGroup || null,
        emergency_contact: doc.emergencyContact || null,
        medical_history: doc.medicalHistory || null,
        allergies: doc.allergies || null,
        current_medications: doc.currentMedications || null,
        symptoms: doc.symptoms || null,
        password: doc.password,
        role: doc.role || 'patient',
        created_at: doc.createdAt?.toISOString() || new Date().toISOString(),
        updated_at: doc.updatedAt?.toISOString() || new Date().toISOString(),
      }]);

      if (error) errors++; else migrated++;
    } catch (err: any) { errors++; }
  }

  if (maxSeq > 0) {
    await supabase.from('counters').upsert({ id: 'patient_code', seq: maxSeq }, { onConflict: 'id' });
  }

  console.log(`✅ Patients: Migrated: ${migrated} | Skipped: ${skipped} | Errors: ${errors}`);
  await mongoose.disconnect();
}
main().catch(() => process.exit(1));
