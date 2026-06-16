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
    return ApiResponse.error(
      'Validation failed',
      'VALIDATION_ERROR',
      parsed.error.format(),
      400
    );
  }

  const data = parsed.data;

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

  // Hash password
  const hashedPassword = await bcrypt.hash(data.password, 12);

  // Convert camelCase to snake_case for Supabase
  const mappedData = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [
      k.replace(/([A-Z])/g, '_$1').toLowerCase(),
      v
    ])
  );

  mappedData.password = hashedPassword;

  // Create doctor
  const { data: newDoctor, error: insertError } = await supabase
    .from('doctors')
    .insert([mappedData])
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