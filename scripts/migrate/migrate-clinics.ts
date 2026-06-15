/**
 * migrate-clinics.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { createClient } from '@supabase/supabase-js';
import { toUUID } from './utils';

const MONGO_URI = process.env.MONGODB_URI!;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!MONGO_URI || !SUPABASE_URL || !SUPABASE_KEY) process.exit(1);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const Clinic = mongoose.models.Clinic || mongoose.model('Clinic', new mongoose.Schema({}, { strict: false }));

async function main() {
  await mongoose.connect(MONGO_URI);
  const clinics = await Clinic.find({}).lean();
  let migrated = 0, skipped = 0, errors = 0;

  for (const clinic of clinics as any[]) {
    try {
      const id = toUUID(clinic._id.toString());
      if (!id) continue;
      const { data: existing } = await supabase.from('clinics').select('id').eq('id', id).maybeSingle();
      if (existing) { skipped++; continue; }

      const payload = {
        id,
        clinic_name: clinic.clinicName || null,
        clinic_type: clinic.clinicType || null,
        description: clinic.description || null,
        registration_number: clinic.registrationNumber || null,
        tax_id: clinic.taxId || null,
        specialties: clinic.specialties || [],
        logo: clinic.logo || null,
        website: clinic.website || null,
        email: clinic.email || null,
        phone: clinic.phone || null,
        password: clinic.password || null,
        images: clinic.images || [],
        address: clinic.address || null,
        city: clinic.city || null,
        state: clinic.state || null,
        postal_code: clinic.postalCode || null,
        country: clinic.country || null,
        role: clinic.role || 'clinic',
        license_document: clinic.licenseDocument || null,
        gst_document: clinic.gstDocument || null,
        license_document_url: clinic.licenseDocumentUrl || null,
        gst_document_url: clinic.gstDocumentUrl || null,
        rejection_reason: clinic.rejectionReason || null,
        is_24x7: clinic.is24x7 || false,
        status: clinic.status || 'pending',
        opening_hours: clinic.openingHours || {},
        created_at: clinic.createdAt?.toISOString() || new Date().toISOString(),
        updated_at: clinic.updatedAt?.toISOString() || new Date().toISOString(),
      };

      const { error } = await supabase.from('clinics').insert([payload]);
      if (error) { console.error(`❌ ${id}:`, error.message); errors++; } else migrated++;
    } catch (err: any) { errors++; }
  }
  console.log(`\n✅ Clinics: Migrated: ${migrated} | Skipped: ${skipped} | Errors: ${errors}`);
  await mongoose.disconnect();
}
main().catch(() => process.exit(1));
