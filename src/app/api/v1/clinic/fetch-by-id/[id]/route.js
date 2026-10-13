import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';

/**
 * GET: Fetch clinic details by ID
 */
/**
 * @swagger
 * /api/v1/clinic/fetch-by-id/{id}:
 *   get:
 *     summary: GET request for /api/v1/clinic/fetch-by-id/{id}
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
 *       500:
 *         description: Internal Server Error
 */
export async function GET(req, { params }) {
  try {
    const { id } = await params;

    if (!id) {
      return ApiResponse.error('Clinic ID is required', 'MISSING_FIELD', [], 400);
    }

    const { data: clinicData, error } = await supabase
      .from('clinics')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;

    if (!clinicData) {
      return ApiResponse.error('Clinic not found', 'NOT_FOUND', [], 404);
    }

    const { password, ...clinic } = clinicData;
    clinic._id = clinic.id;
    clinic.clinicName = clinic.clinic_name || '';
    clinic.clinicType = clinic.clinic_type || 'general';
    clinic.registrationNumber = clinic.registration_number || '';
    clinic.postalCode = clinic.postal_code || '';
    clinic.taxId = clinic.tax_id || '';
    clinic.is24x7 = Boolean(clinic.is_24x7);
    clinic.openingHours = clinic.opening_hours || undefined;
    clinic.licenseDocumentUrl = clinic.license_document_url || clinic.license_document || '';
    clinic.gstDocumentUrl = clinic.gst_document_url || clinic.gst_document || '';
    clinic.contactEmail = clinic.email || '';
    clinic.modules = clinicData.modules || { lab: true, ipd: false };

    return ApiResponse.success({ clinic }, 'Clinic fetched successfully');
  } catch (error) {
    console.error('Error fetching clinic:', error);
    return ApiResponse.error('Internal server error', 'SERVER_ERROR', error.message, 500);
  }
}
