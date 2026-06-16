import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';

// GET clinic profile data by ID
/**
 * @swagger
 * /api/v1/clinic/fetchProfileData/{id}:
 *   get:
 *     summary: GET request for /api/v1/clinic/fetchProfileData/{id}
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
      .single();

    if (error || !clinicData) {
      console.error('Fetch Clinic Error from Supabase:', error);
      return ApiResponse.error('Clinic not found', 'NOT_FOUND', [], 404);
    }

    const clinic = {
      ...clinicData,
      _id: clinicData.id,
      clinicName: clinicData.clinic_name || '',
      clinicType: clinicData.clinic_type || 'general',
      registrationNumber: clinicData.registration_number || '',
      taxId: clinicData.tax_id || '',
      postalCode: clinicData.postal_code || '',
      description: clinicData.description || '',
      address: clinicData.address || '',
      city: clinicData.city || '',
      state: clinicData.state || '',
      country: clinicData.country || '',
      phone: clinicData.phone || '',
      email: clinicData.email || '',
      website: clinicData.website || '',
      logo: clinicData.logo || '',
      specialties: clinicData.specialties || [],
      openingHours: clinicData.opening_hours || undefined,
      createdAt: clinicData.created_at,
      updatedAt: clinicData.updated_at
    };

    return ApiResponse.success({ clinic }, 'Clinic profile fetched successfully');
  } catch (error) {
    console.error('Fetch Clinic Error:', error);
    return ApiResponse.error('Server error', 'SERVER_ERROR', error.message, 500);
  }
}