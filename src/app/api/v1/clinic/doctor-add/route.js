import { NextResponse } from 'next/server';
import { ApiResponse } from '@/utils/apiResponse';
import bcrypt from 'bcryptjs';
import Doctor from '@/models/Doctor';
import dbConnect from '@/utils/db';
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
  await dbConnect();

  const body = await req.json();
  console.log('Registering doctor payload:', body);

  const parsed = doctorRegistrationSchema.safeParse(body);
  if (!parsed.success) {
    console.error('Doctor Registration Validation Error:', JSON.stringify(parsed.error.format(), null, 2));
    return ApiResponse.error(
      'Validation failed',
      'VALIDATION_ERROR',
      parsed.error.format(),
      400
    );
  }

  const {
    firstName,
    lastName,
    dateOfBirth,
    profileImage,
    gender,
    email,
    homeAddress,
    password,
    consultantFee,
    phone,
    specialty,
    supSpeciality,
    identityProof,
    degreeCertificate,
    experience,
    qualifications,
    licenseNumber,
    hospital,
    sessionTime,
    clinicId,
    hospitalAddress,
    hospitalNumber,
    status,
    available,
  } = parsed.data;

  const existingDoctor = await Doctor.findOne({ email });
  if (existingDoctor) {
    return ApiResponse.error('Email already exists', 'DUPLICATE_ENTRY', [], 400);
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 12);

  // Create doctor
  const newDoctor = await Doctor.create({
    firstName,
    lastName,
    dateOfBirth,
    profileImage,
    gender,
    email,
    homeAddress,
    consultantFee,
    sessionTime,
    phone,
    specialty,
    supSpeciality,
    experience,
    qualifications,
    identityProof,
    status,
    degreeCertificate,
    licenseNumber,
    hospital,
    password: hashedPassword,
    clinicId,
    hospitalAddress,
    hospitalNumber,
    available,
  });

  return ApiResponse.success({ doctor: newDoctor }, 'Doctor created successfully', 201);
});