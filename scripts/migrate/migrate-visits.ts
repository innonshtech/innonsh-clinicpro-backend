/**
 * migrate-visits.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { createClient } from '@supabase/supabase-js';
import { toUUID } from './utils';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const Visit = mongoose.models.Visit || mongoose.model('Visit', new mongoose.Schema({}, { strict: false }));

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const visits = await Visit.find({}).lean();
  let migrated = 0, skipped = 0, errors = 0;

  for (const doc of visits as any[]) {
    try {
      const id = toUUID(doc._id.toString());
      if (!id) continue;
      const { data: existing } = await supabase.from('visits').select('id').eq('id', id).maybeSingle();
      if (existing) { skipped++; continue; }

      const { error } = await supabase.from('visits').insert([{
        id,
        clinic_id: toUUID(doc.clinicId),
        appointment_id: toUUID(doc.appointmentId),
        doctor_id: toUUID(doc.doctorId),
        patient_id: toUUID(doc.patientId),
        start_time: doc.startTime?.toISOString() || new Date().toISOString(),
        end_time: doc.endTime?.toISOString() || null,
        status: doc.status || 'completed',
        diagnosis: doc.diagnosis || null,
        medicines: doc.medicines || [],
        notes: doc.notes || null,
        follow_up_date: doc.followUpDate?.toISOString() || null,
        follow_up_notes: doc.followUpNotes || null,
        follow_up_required: doc.followUpRequired || false,
        prescription_url: doc.prescriptionUrl || null,
        version: doc.version || 1,
        created_at: doc.createdAt?.toISOString() || new Date().toISOString(),
        updated_at: doc.updatedAt?.toISOString() || new Date().toISOString(),
      }]);

      if (error) errors++; else migrated++;
    } catch (err: any) { errors++; }
  }

  console.log(`✅ Visits: Migrated: ${migrated} | Skipped: ${skipped} | Errors: ${errors}`);
  await mongoose.disconnect();
}
main().catch(() => process.exit(1));
