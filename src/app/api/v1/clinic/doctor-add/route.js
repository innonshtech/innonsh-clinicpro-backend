import { NextResponse } from 'next/server';
import { ApiResponse } from '@/utils/apiResponse';
import bcrypt from 'bcryptjs';
import { supabase } from '@/lib/supabase';
import { doctorRegistrationSchema } from '@/validations/userValidation';
import { withErrorHandler } from '@/utils/apiHandler';

// Handle POST request to create a doctor
/**
 * @swagger
 * /api/v1/clinic/doctor-add:
 *   post:
 *     summary: POST request for /api/v1/clinic/doctor-add
 *     tags: [Clinic]
 *     responses:
 *       200:
 *         description: Successful response
 *       400:
 *         description: Bad Request
 *       500:
 *         description: Internal Server Error
 */
export const POST = withErrorHandler(async (req) => {
  const body = await req.json();

  const parsed = doctorRegistrationSchema.safeParse(body);
  if (!parsed.success) {
    console.error('Doctor Registration Validation Error:', JSON.stringify(parsed.error.format(), null, 2));
    const firstIssue = parsed.error.issues[0];
    const firstMsg = firstIssue ? `${firstIssue.path.join('.') || 'field'}: ${firstIssue.message}` : 'Validation failed';
    return ApiResponse.error(
      firstMsg,
      'VALIDATION_ERROR',
      parsed.error.format(),
      400
    );
  }

  const data = parsed.data;

  // The doctors table has a NOT NULL constraint on password.
  if (!data.password || typeof data.password !== 'string' || data.password.trim() === '') {
    return ApiResponse.error('Password is required', 'VALIDATION_ERROR', [], 400);
  }

  const { data: existingDoctor, error: fetchError } = await supabase
    .from('doctors')
    .select('id')
    .eq('email', data.email)
    .maybeSingle();

  if (fetchError) throw fetchError;

  if (existingDoctor) {
    return ApiResponse.error('Email already exists', 'DUPLICATE_ENTRY', [], 400);
  }

  // Determine effective clinic ID: header from middleware (authenticated clinic) takes precedence
  const headerClinicId = req.headers.get('x-user-clinic-id') || req.headers.get('x-user-id');
  const effectiveClinicId = headerClinicId || data.clinicId || null;

  // Explicitly construct Supabase insert payload using all supported doctors table columns
  const doctorData = {
    first_name: data.firstName,
    last_name: data.lastName,
    email: data.email,
    phone: data.phone || null,
    specialty: data.specialty || null,
    sup_speciality: data.supSpeciality || null,
    department: data.department || null,
    experience: data.experience || 0,
    license_number: data.licenseNumber || null,
    date_of_birth: data.dateOfBirth || null,
    gender: data.gender || null,
    qualifications: data.qualifications || (data.qualification ? [data.qualification] : []),
    consultant_fee: data.consultantFee !== undefined ? data.consultantFee : (data.consultationFee !== undefined ? Number(data.consultationFee) : null),
    home_address: data.homeAddress || data.home_address || data.address || null,
    location: data.location || null,
    bio: data.bio || null,
    emergency_contact: data.emergencyContact || null,
    emergency_phone: data.emergencyPhone || null,
    emergency_relationship: data.emergencyRelationship || null,
    hospital: data.hospital || null,
    hospital_address: data.hospitalAddress || null,
    hospital_number: data.hospitalNumber || null,
    session_time: data.sessionTime || null,
    clinic_id: effectiveClinicId,
    profile_image: data.profileImage || null,
    degree_certificate: data.degreeCertificate || null,
    identity_proof: data.identityProof || null,
    available: data.available || null,
    available_days: data.available?.days || data.availableDays || null,
    available_time: data.available?.time || data.availableTime || null,
    status: data.status || 'active',
    role: 'doctor',
  };

  // Hash password
  doctorData.password = await bcrypt.hash(data.password, 12);

  // Create doctor in Supabase
  const { data: newDoctor, error: insertError } = await supabase
    .from('doctors')
    .insert([doctorData])
    .select()
    .single();

  if (insertError) {
    console.error('Supabase insert error:', insertError);
    throw insertError;
  }

  newDoctor._id = newDoctor.id;
  delete newDoctor.password;

  return ApiResponse.success({ doctor: newDoctor }, 'Doctor created successfully', 201);
});
