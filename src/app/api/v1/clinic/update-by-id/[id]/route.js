import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';

// Whitelist of valid columns that exist in the 'clinics' table in Supabase
const ALLOWED_CLINIC_COLUMNS = new Set([
  'clinic_name',
  'clinic_type',
  'description',
  'registration_number',
  'tax_id',
  'specialties',
  'logo',
  'website',
  'email',
  'phone',
  'address',
  'city',
  'state',
  'postal_code',
  'country',
  'license_document',
  'license_document_url',
  'gst_document',
  'gst_document_url',
  'is_24x7',
  'opening_hours',
  'updated_at'
]);

/**
 * @swagger
 * /api/v1/clinic/update-by-id/{id}:
 *   put:
 *     summary: PUT request to update clinic by ID
 *     tags: [Clinic]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successful response
 *       400:
 *         description: Bad Request
 *       404:
 *         description: Clinic Not Found
 *       500:
 *         description: Internal Server Error
 */
export async function PUT(req, { params }) {
  try {
    const { id } = await params;

    if (!id) {
      return ApiResponse.error('Clinic ID is required', 'MISSING_FIELD', [], 400);
    }

    const body = await req.json();

    // Map camelCase keys to snake_case
    const mappedUpdates = Object.fromEntries(
      Object.entries(body).map(([k, v]) => [
        k.replace(/([A-Z])/g, '_$1').toLowerCase(),
        v
      ])
    );

    // Support field aliases before filtering
    if (mappedUpdates.registration_number === undefined && body.registrationNumber !== undefined) {
      mappedUpdates.registration_number = body.registrationNumber;
    }
    if (mappedUpdates.tax_id === undefined && (body.taxId !== undefined || body.gstNumber !== undefined)) {
      mappedUpdates.tax_id = body.taxId || body.gstNumber;
    }
    if (mappedUpdates.postal_code === undefined && body.postalCode !== undefined) {
      mappedUpdates.postal_code = body.postalCode;
    }
    if (mappedUpdates.clinic_name === undefined && body.clinicName !== undefined) {
      mappedUpdates.clinic_name = body.clinicName;
    }
    if (mappedUpdates.clinic_type === undefined && body.clinicType !== undefined) {
      mappedUpdates.clinic_type = body.clinicType;
    }
    if (mappedUpdates.opening_hours === undefined && body.openingHours !== undefined) {
      mappedUpdates.opening_hours = body.openingHours;
    }
    if (mappedUpdates.is_24x7 === undefined && body.is24x7 !== undefined) {
      mappedUpdates.is_24x7 = body.is24x7;
    }
    if (mappedUpdates.license_document === undefined && (body.licenseDocumentUrl || body.license_document_url)) {
      mappedUpdates.license_document = body.licenseDocumentUrl || body.license_document_url;
      mappedUpdates.license_document_url = body.licenseDocumentUrl || body.license_document_url;
    }
    if (mappedUpdates.gst_document === undefined && (body.gstDocumentUrl || body.gst_document_url)) {
      mappedUpdates.gst_document = body.gstDocumentUrl || body.gst_document_url;
      mappedUpdates.gst_document_url = body.gstDocumentUrl || body.gst_document_url;
    }

    // Filter to ONLY allowed columns in clinics table
    const safePayload = {};
    for (const [key, value] of Object.entries(mappedUpdates)) {
      if (ALLOWED_CLINIC_COLUMNS.has(key) && value !== undefined) {
        safePayload[key] = value;
      }
    }

    // Always update timestamp
    safePayload.updated_at = new Date().toISOString();

    console.log('[Clinic Update] Target ID:', id, 'Payload keys:', Object.keys(safePayload));

    if (Object.keys(safePayload).length === 0) {
      return ApiResponse.error(
        'No valid fields provided for update',
        'NO_FIELDS_TO_UPDATE',
        [],
        400
      );
    }

    const { data: updatedClinic, error } = await supabase
      .from('clinics')
      .update(safePayload)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Supabase clinic update error:', error);
      return ApiResponse.error(error.message || 'Failed to update clinic', 'DATABASE_ERROR', error, 500);
    }

    if (!updatedClinic) {
      return ApiResponse.error('Clinic not found', 'NOT_FOUND', [], 404);
    }

    // Preserve legacy ID and camelCase properties for frontend
    const { password, ...safeClinic } = updatedClinic;
    safeClinic._id = safeClinic.id;
    safeClinic.clinicName = safeClinic.clinic_name;
    safeClinic.clinicType = safeClinic.clinic_type;
    safeClinic.registrationNumber = safeClinic.registration_number;
    safeClinic.postalCode = safeClinic.postal_code;
    safeClinic.taxId = safeClinic.tax_id;
    safeClinic.is24x7 = safeClinic.is_24x7;
    safeClinic.openingHours = safeClinic.opening_hours;
    safeClinic.licenseDocumentUrl = safeClinic.license_document_url || safeClinic.license_document;
    safeClinic.gstDocumentUrl = safeClinic.gst_document_url || safeClinic.gst_document;
    safeClinic.contactEmail = safeClinic.email;

    return ApiResponse.success({ clinic: safeClinic }, 'Clinic updated successfully');
  } catch (error) {
    console.error('Error in Clinic update route:', error);
    return ApiResponse.error('Internal server error', 'SERVER_ERROR', error.message, 500);
  }
}
