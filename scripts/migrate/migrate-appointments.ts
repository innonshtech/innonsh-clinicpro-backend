/**
 * migrate-appointments.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { createClient } from '@supabase/supabase-js';
import { toUUID } from './utils';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const Appointment = mongoose.models.Appointment || mongoose.model('Appointment', new mongoose.Schema({}, { strict: false }));

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const appointments = await Appointment.find({}).lean();
  let migrated = 0, skipped = 0, errors = 0;

  for (const doc of appointments as any[]) {
    try {
      const id = toUUID(doc._id.toString());
      if (!id) continue;
      const { data: existing } = await supabase.from('appointments').select('id').eq('id', id).maybeSingle();
      if (existing) { skipped++; continue; }

      const apptDate = doc.appointmentDate ? new Date(doc.appointmentDate).toISOString().split('T')[0] : null;

      const { error } = await supabase.from('appointments').insert([{
        id,
        clinic_id: toUUID(doc.clinicId),
        patient_id: toUUID(doc.patientId),
        doctor_id: toUUID(doc.doctorId),
        appointment_date: apptDate,
        time_slot: doc.timeSlot,
        status: doc.status || 'booked',
        type: doc.type || 'normal',
        linked_visit_id: toUUID(doc.linked_visit_id),
        reason: doc.reason || '',
        notes: doc.notes || null,
        cancel_reason: doc.cancelReason || null,
        queue_number: doc.queueNumber || null,
        check_in_time: doc.checkInTime?.toISOString() || null,
        is_emergency: doc.isEmergency || false,
        rescheduled_from: doc.rescheduledFrom || null,
        sms_notified: doc.smsNotified || false,
        doctor_name: doc.doctorName || null,
        patient_name: doc.patientName || null,
        created_at: doc.createdAt?.toISOString() || new Date().toISOString(),
        updated_at: doc.updatedAt?.toISOString() || new Date().toISOString(),
      }]);

      if (error) errors++; else migrated++;
    } catch (err: any) { errors++; }
  }

  console.log(`✅ Appointments: Migrated: ${migrated} | Skipped: ${skipped} | Errors: ${errors}`);
  await mongoose.disconnect();
}
main().catch(() => process.exit(1));
