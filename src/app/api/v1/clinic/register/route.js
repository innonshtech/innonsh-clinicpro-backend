import { ApiResponse } from '@/utils/apiResponse';
import dbConnect from '@/utils/db';
import Clinic from '@/models/Clinic';
import { clinicRegistrationSchema } from '@/validations/userValidation';
import { withErrorHandler } from '@/utils/apiHandler';
import bcrypt from 'bcryptjs';

// GET: /api/v1/clinic/register (Used for fetching all clinics in this route context)
/**
 * @swagger
 * /api/v1/clinic/register:
 *   get:
 *     summary: GET request for /api/v1/clinic/register
 *     tags: [Clinic]
 *     responses:
 *       200:
 *         description: Successful response
 */
export const GET = withErrorHandler(async () => {
  await dbConnect();
  const clinics = await Clinic.find().select('-password');
  return ApiResponse.success({ clinics }, 'Clinics fetched successfully');
});

// POST: /api/v1/clinic/register
/**
 * @swagger
 * /api/v1/clinic/register:
 *   post:
 *     summary: POST request for /api/v1/clinic/register
 *     tags: [Clinic]
 *     responses:
 *       200:
 *         description: Successful response
 */
export const POST = withErrorHandler(async (req) => {
  await dbConnect();
  const body = await req.json();

  const parsed = clinicRegistrationSchema.safeParse(body);
  if (!parsed.success) {
    console.error('Registration Validation Error:', JSON.stringify(parsed.error.format(), null, 2));
    return ApiResponse.error(
      'Validation failed',
      'VALIDATION_ERROR',
      parsed.error.format(),
      400
    );
  }

  const {
    clinicName,
    clinicType = 'general',
    description,
    registrationNumber,
    taxId,
    specialties = [],
    logo,
    website,
    email,
    phone,
    address,
    password,
    city,
    state,
    postalCode,
    country,
    openingHours = {},
    licenseDocument,
    licenseDocumentUrl,
    gstDocument,
    gstDocumentUrl,
    is24x7 = false,
  } = parsed.data;

  // Cleaned Opening Hours
  const cleanedOpeningHours = {};
  if (openingHours && typeof openingHours === 'object') {
    for (const [day, time] of Object.entries(openingHours)) {
      cleanedOpeningHours[day] = {
        open: time?.open || '',
        close: time?.close || '',
      };
    }
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const newClinic = await Clinic.create({
    clinicName,
    clinicType,
    description,
    registrationNumber,
    taxId,
    specialties,
    logo,
    website,
    email,
    phone,
    address,
    password: hashedPassword,
    city,
    state,
    postalCode,
    country,
    role: 'clinic',
    openingHours: cleanedOpeningHours,
    licenseDocument,
    licenseDocumentUrl,
    gstDocument,
    gstDocumentUrl,
    is24x7,
  });

  const clinicResponse = newClinic.toObject();
  delete clinicResponse.password;

  return ApiResponse.success({ clinic: clinicResponse }, 'Clinic registered successfully', 201);
});
