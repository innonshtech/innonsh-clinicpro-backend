import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';
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
  const { data: clinics, error } = await supabase.from('clinics').select('*');
  
  if (error) {
    throw error;
  }

  const formattedClinics = (clinics || []).map(c => {
    const mapped = { ...c, _id: c.id };
    delete mapped.password;
    return mapped;
  });

  return ApiResponse.success({ clinics: formattedClinics }, 'Clinics fetched successfully');
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

  const data = parsed.data;

  // Cleaned Opening Hours
  const cleanedOpeningHours = {};
  if (data.openingHours && typeof data.openingHours === 'object') {
    for (const [day, time] of Object.entries(data.openingHours)) {
      cleanedOpeningHours[day] = {
        open: time?.open || '',
        close: time?.close || '',
      };
    }
  }

  const mappedData = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [
      k.replace(/([A-Z])/g, '_$1').toLowerCase(),
      v
    ])
  );

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(data.password, salt);

  mappedData.password = hashedPassword;
  mappedData.opening_hours = cleanedOpeningHours;
  mappedData.role = 'clinic';
  
  // Set defaults that were in mongoose schema
  if (mappedData.clinic_type === undefined) mappedData.clinic_type = 'general';
  if (mappedData.specialties === undefined) mappedData.specialties = [];
  if (mappedData.is24x7 === undefined) mappedData.is24x7 = false;

  const { data: newClinic, error } = await supabase
    .from('clinics')
    .insert([mappedData])
    .select()
    .single();

  if (error) {
    console.error('Supabase clinic insert error:', error);
    throw error;
  }

  const clinicResponse = { ...newClinic, _id: newClinic.id };
  delete clinicResponse.password;

  return ApiResponse.success({ clinic: clinicResponse }, 'Clinic registered successfully', 201);
});
