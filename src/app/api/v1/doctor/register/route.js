import { ApiResponse } from '@/utils/apiResponse';
import bcrypt from 'bcryptjs';
import { supabase } from '@/lib/supabase';
import { doctorRegistrationSchema } from '@/validations/userValidation';
import { withErrorHandler } from '@/utils/apiHandler';

/**
 * @swagger
 * /api/v1/doctor/register:
 *   post:
 *     summary: POST request for /api/v1/doctor/register
 *     tags: [Doctor]
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
  // There is no invitation/email flow, so a password must always be provided explicitly.
  if (!data.password || typeof data.password !== 'string' || data.password.trim() === '') {
    return ApiResponse.error('Password is required', 'VALIDATION_ERROR', [], 400);
  }

  // Check for existing doctor
  const { data: existingDoctor, error: fetchError } = await supabase
    .from('doctors')
    .select('id')
    .or(`email.eq.${data.email},license_number.eq.${data.licenseNumber}`)
    .maybeSingle();

  if (fetchError) throw fetchError;

  if (existingDoctor) {
    return ApiResponse.error('Email or license number already exists', 'DUPLICATE_ENTRY', [], 400);
  }

  // Explicitly construct Supabase insert payload using confirmed doctors table columns
  const doctorData = {
    first_name: data.firstName,
    last_name: data.lastName,
    email: data.email,
    phone: data.phone || null,
    specialty: data.specialty || null,
    experience: data.experience || 0,
    license_number: data.licenseNumber || null,
    date_of_birth: data.dateOfBirth || null,
    gender: data.gender || null,
    qualifications: (Array.isArray(data.qualifications) && data.qualifications.length > 0)
      ? data.qualifications
      : (data.qualification
          ? (typeof data.qualification === 'string'
              ? data.qualification.split(',').map(s => s.trim()).filter(Boolean)
              : [data.qualification])
          : (data.qualifications || [])),
    home_address: data.homeAddress || data.home_address || data.address || null,
    hospital_address: data.hospitalAddress || null,
    location: data.location || null,
    department: data.department || null,
    bio: data.bio || null,
    consultant_fee: data.consultantFee || null,
    available: data.available || null,
    available_days: data.available?.days || null,
    profile_image: data.profileImage || null,
    sup_speciality: data.supSpeciality || null,
    clinic_id: data.clinicId || null,
    session_time: data.sessionTime || null,
    degree_certificate: data.degreeCertificate || null,
    identity_proof: data.identityProof || null,
    emergency_contact: data.emergencyContact || null,
    emergency_phone: data.emergencyPhone || null,
    emergency_relationship: data.emergencyRelationship || null,
    status: data.status || 'active',
    role: 'doctor',
  };

  if (data.hospitalNumber) {
    doctorData.hospital_number = data.hospitalNumber;
  }
  if (data.hospital) {
    doctorData.hospital = data.hospital;
  }

  // Hash password only if a non-empty password is explicitly provided
  if (data.password && typeof data.password === 'string' && data.password.trim() !== '') {
    doctorData.password = await bcrypt.hash(data.password, 10);
  }

  // Create doctor
  const { data: newDoctor, error: insertError } = await supabase
    .from('doctors')
    .insert([doctorData])
    .select()
    .single();

  if (insertError) {
    console.error('Supabase insert error:', insertError);
    throw insertError;
  }

  // Preserve legacy ID for frontend compatibility
  newDoctor._id = newDoctor.id;
  delete newDoctor.password;

  return ApiResponse.success({ doctor: newDoctor }, 'Doctor created successfully', 201);
});
