import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';

/**
 * GET: Fetch all registered clinics
 */
/**
 * @swagger
 * /api/v1/clinic/fetch-all-clinics:
 *   get:
 *     summary: GET request for /api/v1/clinic/fetch-all-clinics
 *     tags: [Clinic]
 *     responses:
 *       200:
 *         description: Successful response
 *       400:
 *         description: Bad Request
 *       500:
 *         description: Internal Server Error
 */
export async function GET() {
  try {
    const { data: clinicsData, error } = await supabase
      .from('clinics')
      .select('id, clinic_name, email, phone, address, city, clinic_type, status, registration_number, created_at, updated_at, images');

    if (error) throw error;

    const clinics = (clinicsData || []).map(clinic => ({
      ...clinic,
      _id: clinic.id,
      clinicName: clinic.clinic_name,
      clinicType: clinic.clinic_type,
      approved: clinic.status === 'active',
      registrationNumber: clinic.registration_number,
      imageUrls: clinic.images,
      createdAt: clinic.created_at,
      updatedAt: clinic.updated_at
    }));

    return ApiResponse.success({ clinics }, 'Clinics fetched successfully');
  } catch (error) {
    console.error('Error fetching clinics:', error);
    return ApiResponse.error('Failed to fetch clinics', 'SERVER_ERROR', error.message, 500);
  }
}