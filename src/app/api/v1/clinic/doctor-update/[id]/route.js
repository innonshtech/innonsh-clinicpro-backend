import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';
import bcrypt from 'bcryptjs';
import { doctorUpdateSchema } from '@/validations/userValidation';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { withTenant } from '@/utils/tenantMiddleware';

// Whitelist of valid columns that exist in the 'doctors' table in Supabase
const ALLOWED_DOCTOR_COLUMNS = new Set([
  'first_name',
  'last_name',
  'email',
  'password',
  'phone',
  'role',
  'status',
  'is_verified',
  'gender',
  'date_of_birth',
  'specialty',
  'sup_speciality',
  'experience',
  'consultant_fee',
  'qualifications',
  'home_address',
  'hospital',
  'hospital_address',
  'hospital_number',
  'license_number',
  'session_time',
  'profile_image',
  'identity_proof',
  'degree_certificate',
  'available',
  'available_days',
  'available_time',
  'emergency_contact',
  'emergency_phone',
  'emergency_relationship',
  'location',
  'department',
]);

/**
 * @swagger
 * /api/v1/clinic/doctor-update/{id}:
 *   put:
 *     summary: Update doctor details (Clinic-scoped)
 *     tags: [Clinic]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Doctor updated successfully
 *       400:
 *         description: Validation error
 *       403:
 *         description: Forbidden - Not the owning clinic
 *       404:
 *         description: Doctor not found
 */
async function handleDoctorUpdate(req, { params }) {
  const resolvedParams = await params;
  const { id } = resolvedParams;

  if (!id) {
    return ApiResponse.error('Doctor ID is required', 'MISSING_FIELD', [], 400);
  }

  const body = await req.json().catch(() => ({}));
  const parsed = doctorUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return ApiResponse.error(
      'Validation failed',
      'VALIDATION_ERROR',
      parsed.error.format(),
      400
    );
  }

  // 1. Fetch existing doctor
  const { data: existingDoctor, error: fetchErr } = await supabase
    .from('doctors')
    .select('id, clinic_id')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr) {
    console.error('[Clinic Doctor Update] Fetch error:', fetchErr);
    throw fetchErr;
  }

  if (!existingDoctor) {
    return ApiResponse.error('Doctor not found', 'DOCTOR_NOT_FOUND', [], 404);
  }

  // 2. Strict Clinic Ownership Verification
  const clinicTenantId = req.tenant_id;
  if (!existingDoctor.clinic_id || existingDoctor.clinic_id !== clinicTenantId) {
    return ApiResponse.error(
      'Forbidden: You can only update doctors belonging to your clinic',
      'FORBIDDEN',
      { doctorClinicId: existingDoctor.clinic_id, yourClinicId: clinicTenantId },
      403
    );
  }

  let updates = parsed.data;

  // Never allow changing clinic_id through update
  delete updates.clinicId;
  delete updates.clinic_id;

  if (updates.password && typeof updates.password === 'string' && updates.password.trim() !== '') {
    updates.password = await bcrypt.hash(updates.password, 12);
  } else {
    delete updates.password;
  }

  // Convert camelCase to snake_case for Supabase
  const mappedUpdates = Object.fromEntries(
    Object.entries(updates).map(([k, v]) => [
      k.replace(/([A-Z])/g, '_$1').toLowerCase(),
      v
    ])
  );

  // Field aliases
  if (mappedUpdates.home_address === undefined && (updates.homeAddress !== undefined || updates.address !== undefined)) {
    mappedUpdates.home_address = updates.homeAddress !== undefined ? updates.homeAddress : updates.address;
  }
  if (mappedUpdates.is_verified === undefined && updates.isVerified !== undefined) {
    mappedUpdates.is_verified = updates.isVerified;
  }
  if (mappedUpdates.consultation_fee !== undefined && mappedUpdates.consultant_fee === undefined) {
    mappedUpdates.consultant_fee = mappedUpdates.consultation_fee;
  }
  if (mappedUpdates.sup_speciality === undefined && (updates.subSpecialty !== undefined || mappedUpdates.sub_specialty !== undefined)) {
    mappedUpdates.sup_speciality = updates.subSpecialty !== undefined ? updates.subSpecialty : mappedUpdates.sub_specialty;
  }
  if (mappedUpdates.hospital_number === undefined && (updates.hospitalPhone !== undefined || mappedUpdates.hospital_phone !== undefined)) {
    mappedUpdates.hospital_number = updates.hospitalPhone !== undefined ? updates.hospitalPhone : mappedUpdates.hospital_phone;
  }
  if (mappedUpdates.location === undefined && (updates.hospitalCity !== undefined || mappedUpdates.hospital_city !== undefined)) {
    mappedUpdates.location = updates.hospitalCity !== undefined ? updates.hospitalCity : mappedUpdates.hospital_city;
  }
  if (mappedUpdates.emergency_contact === undefined && (updates.emergencyContactName !== undefined || mappedUpdates.emergency_contact_name !== undefined)) {
    mappedUpdates.emergency_contact = updates.emergencyContactName !== undefined ? updates.emergencyContactName : mappedUpdates.emergency_contact_name;
  }
  if (mappedUpdates.session_time === undefined && updates.sessionTime !== undefined) {
    mappedUpdates.session_time = updates.sessionTime;
  }
  if (mappedUpdates.qualification !== undefined && mappedUpdates.qualifications === undefined) {
    mappedUpdates.qualifications = Array.isArray(mappedUpdates.qualification)
      ? mappedUpdates.qualification
      : (typeof mappedUpdates.qualification === 'string'
          ? mappedUpdates.qualification.split(',').map(s => s.trim()).filter(Boolean)
          : [mappedUpdates.qualification].filter(Boolean));
  }
  if (mappedUpdates.available && typeof mappedUpdates.available === 'object') {
    if (Array.isArray(mappedUpdates.available.days) && mappedUpdates.available_days === undefined) {
      mappedUpdates.available_days = mappedUpdates.available.days;
    }
    if (mappedUpdates.available.time !== undefined && mappedUpdates.available_time === undefined) {
      mappedUpdates.available_time = mappedUpdates.available.time;
    }
  }
  if (mappedUpdates.available_days === undefined && Array.isArray(updates.availableDays)) {
    mappedUpdates.available_days = updates.availableDays;
  }
  if (mappedUpdates.available_time === undefined && (updates.availableTime !== undefined || updates.sessionTime !== undefined)) {
    mappedUpdates.available_time = updates.availableTime || updates.sessionTime;
  }
  // Filter to valid columns only
  const safePayload = {};
  for (const [key, value] of Object.entries(mappedUpdates)) {
    if (ALLOWED_DOCTOR_COLUMNS.has(key) && value !== undefined) {
      safePayload[key] = value;
    }
  }

  if (Object.keys(safePayload).length === 0) {
    return ApiResponse.error(
      'No valid fields provided for update',
      'NO_FIELDS_TO_UPDATE',
      [],
      400
    );
  }

  const { data: updatedDoctor, error: updateErr } = await supabase
    .from('doctors')
    .update(safePayload)
    .eq('id', id)
    .select()
    .single();

  if (updateErr) {
    console.error('[Clinic Doctor Update] Supabase update error:', updateErr);
    throw updateErr;
  }

  updatedDoctor._id = updatedDoctor.id;
  updatedDoctor.isVerified = Boolean(updatedDoctor.is_verified);
  delete updatedDoctor.password;

  return ApiResponse.success({ doctor: updatedDoctor }, 'Doctor updated successfully');
}

export const PUT = withErrorHandler(withRoles(['clinic'], withTenant(handleDoctorUpdate)));
export const PATCH = withErrorHandler(withRoles(['clinic'], withTenant(handleDoctorUpdate)));
