import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';
import { labRegistrationSchema } from '@/validations/userValidation';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import bcrypt from 'bcryptjs';

/**
 * @swagger
 * /api/v1/lab/register:
 *   post:
 *     summary: Register a new independent laboratory (Admin only)
 *     tags: [Lab]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       201:
 *         description: Lab registered successfully
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Admin only)
 */
export const POST = withErrorHandler(
  withRoles(['admin'], async (req) => {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return ApiResponse.error('Invalid JSON body', 'JSON_ERROR', [], 400);
    }

    const parsed = labRegistrationSchema.safeParse(body);
    if (!parsed.success) {
      return ApiResponse.error(
        'Validation failed',
        'VALIDATION_ERROR',
        parsed.error.format(),
        400
      );
    }

    const data = parsed.data;
    const cleanLoginEmail = data.loginEmail.trim().toLowerCase();

    // Check if loginEmail is already in use in labs table
    const { data: existingLab } = await supabase
      .from('labs')
      .select('id')
      .ilike('login_email', cleanLoginEmail)
      .maybeSingle();

    if (existingLab) {
      return ApiResponse.error(
        'A laboratory with this login email already exists',
        'DUPLICATE_LOGIN_EMAIL',
        { loginEmail: 'Email is already in use' },
        409
      );
    }

    // Hash password with bcrypt
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(data.password, salt);

    // Format fields for Supabase table columns
    const insertPayload = {
      lab_name: data.labName.trim(),
      lab_type: data.labType || 'diagnostic',
      description: data.description ? data.description.trim() : null,
      logo: data.logo || null,
      phone: data.phone.trim(),
      email: data.email.trim().toLowerCase(),
      login_email: cleanLoginEmail,
      password: hashedPassword,
      website: data.website ? data.website.trim() : null,
      address: data.address.trim(),
      city: data.city.trim(),
      state: data.state.trim(),
      postal_code: data.postalCode.trim(),
      country: data.country ? data.country.trim() : 'India',
      registration_number: data.registrationNumber ? data.registrationNumber.trim() : null,
      tax_id: data.taxId ? data.taxId.trim() : null,
      license_document_url: data.licenseDocumentUrl || null,
      nabl_accredited: Boolean(data.nablAccredited),
      home_collection_available: Boolean(data.homeCollectionAvailable),
      operating_hours: data.operatingHours || {},
      role: 'lab',
      status: 'active'
    };

    const { data: createdLab, error: insertError } = await supabase
      .from('labs')
      .insert([insertPayload])
      .select('id, lab_name, lab_type, description, logo, phone, email, login_email, website, address, city, state, postal_code, country, registration_number, tax_id, license_document_url, nabl_accredited, home_collection_available, operating_hours, role, status, created_at, updated_at')
      .single();

    if (insertError) {
      console.error('[LAB REGISTER ERROR] Supabase insert error:', insertError);
      throw insertError;
    }

    // Explicitly guarantee password is never exposed
    const safeLabResponse = { ...createdLab, _id: createdLab.id };
    delete safeLabResponse.password;

    return ApiResponse.success(
      { lab: safeLabResponse },
      'Lab registered and activated successfully',
      201
    );
  })
);
