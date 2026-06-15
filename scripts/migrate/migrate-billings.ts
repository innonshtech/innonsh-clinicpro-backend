/**
 * migrate-billings.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { createClient } from '@supabase/supabase-js';
import { toUUID } from './utils';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const Billing = mongoose.models.Billing || mongoose.model('Billing', new mongoose.Schema({}, { strict: false }));

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const billings = await Billing.find({}).lean();
  let migrated = 0, skipped = 0, errors = 0, maxSeq = 0;

  for (const doc of billings as any[]) {
    try {
      const id = toUUID(doc._id.toString());
      if (!id) continue;
      const { data: existing } = await supabase.from('billings').select('id').eq('id', id).maybeSingle();
      if (existing) { skipped++; continue; }

      if (doc.billingId) {
        const match = doc.billingId.match(/INV-\d{4}-(\d+)/);
        if (match) {
          const seq = parseInt(match[1], 10);
          if (seq > maxSeq) maxSeq = seq;
        }
      }

      const { error } = await supabase.from('billings').insert([{
        id,
        billing_id: doc.billingId,
        clinic_id: toUUID(doc.clinicId),
        patient_id: toUUID(doc.patientId),
        visit_id: toUUID(doc.visitId),
        doctor_id: toUUID(doc.doctorId),
        items: doc.items || [],
        total_amount: doc.totalAmount || 0,
        discount: doc.discount || 0,
        tax: doc.tax || 0,
        final_amount: doc.finalAmount || 0,
        status: doc.status || 'pending',
        payment_method: doc.paymentMethod || null,
        transaction_id: doc.transactionId || null,
        paid_at: doc.paidAt?.toISOString() || null,
        paid_amount: doc.paidAmount || 0,
        remaining_amount: doc.remainingAmount || doc.finalAmount || 0,
        refund_amount: doc.refundAmount || 0,
        refund_reason: doc.refundReason || null,
        refunded_at: doc.refundedAt?.toISOString() || null,
        created_at: doc.createdAt?.toISOString() || new Date().toISOString(),
        updated_at: doc.updatedAt?.toISOString() || new Date().toISOString(),
      }]);

      if (error) errors++; else migrated++;
    } catch (err: any) { errors++; }
  }

  if (maxSeq > 0) {
    const currentYear = new Date().getFullYear();
    await supabase.from('counters').upsert(
      { id: `invoice_seq_${currentYear}`, seq: maxSeq },
      { onConflict: 'id' }
    );
  }

  console.log(`✅ Billings: Migrated: ${migrated} | Skipped: ${skipped} | Errors: ${errors}`);
  await mongoose.disconnect();
}
main().catch(() => process.exit(1));
