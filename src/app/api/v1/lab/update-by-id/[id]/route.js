import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';

const formatTitleCase = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(word => (word ? word.charAt(0).toUpperCase() + word.slice(1) : ''))
    .join(' ');
};

// Whitelist of valid columns that exist in the 'labs' table in Supabase
const ALLOWED_LAB_COLUMNS = new Set([
  'lab_name',
  'lab_type',
  'description',
  'logo',
  'phone',
  'email',
  'website',
  'address',
  'city',
  'state',
  'postal_code',
  'country',
  'registration_number',
  'tax_id',
  'license_document_url',
  'nabl_accredited',
  'home_collection_available',
  'operating_hours',
  'status',
  'updated_at'
]);

/**
 * @swagger
 * /api/v1/lab/update-by-id/{id}:
 *   put:
 *     summary: PUT request to update laboratory by ID
 *     tags: [Lab]
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
 *         description: Laboratory Not Found
 *       500:
 *         description: Internal Server Error
 */
export async function PUT(req, { params }) {
  try {
    const { id } = await params;

    if (!id) {
      return ApiResponse.error('Lab ID is required', 'MISSING_FIELD', [], 400);
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
    if (mappedUpdates.lab_name === undefined && body.labName !== undefined) {
      mappedUpdates.lab_name = body.labName;
    }
    if (mappedUpdates.lab_type === undefined && body.labType !== undefined) {
      mappedUpdates.lab_type = body.labType;
    }
    if (mappedUpdates.registration_number === undefined && (body.registrationNumber !== undefined || body.registration_number !== undefined)) {
      mappedUpdates.registration_number = body.registrationNumber || body.registration_number;
    }
    if (mappedUpdates.tax_id === undefined && (body.taxId !== undefined || body.tax_id !== undefined)) {
      mappedUpdates.tax_id = body.taxId || body.tax_id;
    }
    if (mappedUpdates.postal_code === undefined && (body.postalCode !== undefined || body.postal_code !== undefined)) {
      mappedUpdates.postal_code = body.postalCode || body.postal_code;
    }
    if (mappedUpdates.nabl_accredited === undefined && (body.nablAccredited !== undefined || body.nabl_accredited !== undefined)) {
      mappedUpdates.nabl_accredited = Boolean(body.nablAccredited ?? body.nabl_accredited);
    }
    if (mappedUpdates.home_collection_available === undefined && (body.homeCollectionAvailable !== undefined || body.home_collection_available !== undefined)) {
      mappedUpdates.home_collection_available = Boolean(body.homeCollectionAvailable ?? body.home_collection_available);
    }
    if (mappedUpdates.operating_hours === undefined && (body.operatingHours !== undefined || body.operating_hours !== undefined)) {
      mappedUpdates.operating_hours = body.operatingHours || body.operating_hours;
    }

    // Apply Title Case formatting to lab name
    if (mappedUpdates.lab_name !== undefined) {
      mappedUpdates.lab_name = formatTitleCase(mappedUpdates.lab_name);
    }

    // Filter to ONLY allowed columns in labs table
    const safePayload = {};
    for (const [key, value] of Object.entries(mappedUpdates)) {
      if (ALLOWED_LAB_COLUMNS.has(key) && value !== undefined) {
        safePayload[key] = value;
      }
    }

    // Strict security: NEVER allow password, login_email, or role to be changed via update
    delete safePayload.password;
    delete safePayload.login_email;
    delete safePayload.role;

    safePayload.updated_at = new Date().toISOString();

    console.log('[Lab Update] Target ID:', id, 'Payload keys:', Object.keys(safePayload));

    if (Object.keys(safePayload).length === 0) {
      return ApiResponse.error(
        'No valid fields provided for update',
        'NO_FIELDS_TO_UPDATE',
        [],
        400
      );
    }

    const { data: updatedLab, error } = await supabase
      .from('labs')
      .update(safePayload)
      .eq('id', id)
      .select('id, lab_name, lab_type, description, logo, phone, email, login_email, website, address, city, state, postal_code, country, registration_number, tax_id, license_document_url, nabl_accredited, home_collection_available, operating_hours, role, status, created_at, updated_at')
      .maybeSingle();

    if (error) {
      console.error('Supabase lab update error:', error);
      return ApiResponse.error(error.message || 'Failed to update laboratory record', 'DATABASE_ERROR', error, 500);
    }

    if (!updatedLab) {
      return ApiResponse.error('Laboratory not found', 'NOT_FOUND', [], 404);
    }

    // Preserve legacy ID and camelCase properties for frontend
    const { password, ...safeLab } = updatedLab;
    safeLab._id = safeLab.id;
    safeLab.labName = safeLab.lab_name;
    safeLab.labType = safeLab.lab_type;
    safeLab.registrationNumber = safeLab.registration_number;
    safeLab.postalCode = safeLab.postal_code;
    safeLab.taxId = safeLab.tax_id;
    safeLab.nablAccredited = safeLab.nabl_accredited;
    safeLab.homeCollectionAvailable = safeLab.home_collection_available;
    safeLab.operatingHours = safeLab.operating_hours;
    safeLab.contactEmail = safeLab.email;
    safeLab.createdAt = safeLab.created_at;
    safeLab.updatedAt = safeLab.updated_at;

    return ApiResponse.success({ lab: safeLab }, 'Laboratory updated successfully');
  } catch (error) {
    console.error('Error in Lab update route:', error);
    return ApiResponse.error('Internal server error', 'SERVER_ERROR', error.message, 500);
  }
}
