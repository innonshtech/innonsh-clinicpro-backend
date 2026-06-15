/**
 * migrate-auditlogs.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { createClient } from '@supabase/supabase-js';
import { toUUID } from './utils';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', new mongoose.Schema({}, { strict: false }));

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const logs = await AuditLog.find({}).lean();
  let migrated = 0, skipped = 0, errors = 0;

  for (const doc of logs as any[]) {
    try {
      const id = toUUID(doc._id.toString());
      if (!id) continue;
      const { data: existing } = await supabase.from('audit_logs').select('id').eq('id', id).maybeSingle();
      if (existing) { skipped++; continue; }

      const { error } = await supabase.from('audit_logs').insert([{
        id,
        clinic_id: toUUID(doc.clinicId),
        user_id: toUUID(doc.userId) || doc.userId?.toString() || id, // fallback if user_id was generic string
        user_role: doc.userRole,
        user_name: doc.userName || null,
        action: doc.action,
        resource_type: doc.resourceType,
        resource_id: toUUID(doc.resourceId) || doc.resourceId?.toString() || id,
        changes_before: doc.changes?.before || null,
        changes_after: doc.changes?.after || doc.changes || null,
        metadata: doc.metadata || null,
        created_at: doc.createdAt?.toISOString() || new Date().toISOString(),
      }]);

      if (error) errors++; else migrated++;
    } catch (err: any) { errors++; }
  }

  console.log(`✅ AuditLogs: Migrated: ${migrated} | Skipped: ${skipped} | Errors: ${errors}`);
  await mongoose.disconnect();
}
main().catch(() => process.exit(1));
