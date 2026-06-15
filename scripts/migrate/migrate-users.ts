/**
 * migrate-users.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { createClient } from '@supabase/supabase-js';
import { toUUID } from './utils';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const Admin = mongoose.models.Admin || mongoose.model('Admin', new mongoose.Schema({}, { strict: false }));
const Staff = mongoose.models.Staff || mongoose.model('Staff', new mongoose.Schema({}, { strict: false }));

async function migrateTable(mongoModel: any, supabaseTable: string, mapFn: any) {
  const docs = await mongoModel.find({}).lean();
  let migrated = 0, skipped = 0, errors = 0;

  for (const doc of docs) {
    try {
      const id = toUUID(doc._id.toString());
      if (!id) continue;
      const { data: existing } = await supabase.from(supabaseTable).select('id').eq('id', id).maybeSingle();
      if (existing) { skipped++; continue; }

      const payload = { id, ...mapFn(doc) };
      const { error } = await supabase.from(supabaseTable).insert([payload]);
      if (error) errors++; else migrated++;
    } catch (err: any) { errors++; }
  }
  console.log(`✅ ${supabaseTable}: Migrated: ${migrated} | Skipped: ${skipped} | Errors: ${errors}`);
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);

  await migrateTable(Admin, 'admins', (doc: any) => ({
    name: doc.name || null,
    email: doc.email,
    password: doc.password,
    role: doc.role || 'admin',
    created_at: doc.createdAt?.toISOString() || new Date().toISOString(),
    updated_at: doc.updatedAt?.toISOString() || new Date().toISOString(),
  }));

  await migrateTable(Staff, 'staff', (doc: any) => ({
    first_name: doc.firstName || null,
    last_name: doc.lastName || null,
    email: doc.email,
    phone: doc.phone || null,
    status: doc.status || 'active',
    clinic_id: toUUID(doc.clinicId),
    doctor_id: toUUID(doc.doctorId),
    password: doc.password,
    role: doc.role || 'receptionist',
    created_at: doc.createdAt?.toISOString() || new Date().toISOString(),
    updated_at: doc.updatedAt?.toISOString() || new Date().toISOString(),
  }));

  await mongoose.disconnect();
}
main().catch(() => process.exit(1));
