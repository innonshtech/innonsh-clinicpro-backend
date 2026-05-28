import { ApiResponse } from '@/utils/apiResponse';
import bcrypt from 'bcryptjs';
import Doctor from '@/models/Doctor';
import dbConnect from '@/utils/db';
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
  await dbConnect();

  const body = await req.json();

  const parsed = doctorRegistrationSchema.safeParse(body);
  if (!parsed.success) {
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
    password,
    consultantFee,
    phone,
    specialty,
    supSpeciality,
    sessionTime,
    degreeCertificate,
    identityProof,
    status,
    experience,
    qualifications,
    licenseNumber,
    hospital,
    hospitalAddress,
    hospitalNumber,
    available
  } = parsed.data;

  // Check for existing doctor
  const existingDoctor = await Doctor.findOne({
    $or: [{ email }, { licenseNumber }]
  });

  if (existingDoctor) {
    return ApiResponse.error('Email or license number already exists', 'DUPLICATE_ENTRY', [], 400);
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
    password: hashedPassword,
    consultantFee,
    sessionTime,
    phone,
    specialty,
    supSpeciality,
    experience,
    qualifications,
    licenseNumber,
    hospital,
    hospitalAddress,
    hospitalNumber,
    available,
    degreeCertificate,
    identityProof,
    status,
  });

  return ApiResponse.success({ doctor: newDoctor }, 'Doctor created successfully', 201);
});