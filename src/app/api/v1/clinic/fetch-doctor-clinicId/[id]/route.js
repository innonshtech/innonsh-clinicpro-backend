import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';

// GET doctors by clinic ID
/**
 * @swagger
 * /api/v1/clinic/fetch-doctor-clinicId/{id}:
 *   get:
 *     summary: GET request for /api/v1/clinic/fetch-doctor-clinicId/{id}
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

    const { data: doctorsData, error } = await supabase
      .from('doctors')
      .select('*')
      .eq('clinic_id', id);

    if (error) throw error;

    const doctors = (doctorsData || []).map(doc => {
      const { password, ...rest } = doc;
      return {
        ...rest,
        _id: rest.id,
        firstName: rest.first_name,
        lastName: rest.last_name,
        clinicId: rest.clinic_id,
        availableDays: rest.available_days,
        sessionTime: rest.session_time,
        patientLoad: rest.patient_load,
        consultationFee: rest.consultation_fee,
        consultantFee: rest.consultation_fee,
        profileImage: rest.profile_image,
        dateOfBirth: rest.date_of_birth,
        licenseNumber: rest.license_number,
        hospitalAddress: rest.hospital_address,
        supSpeciality: rest.sup_speciality,
        homeAddress: rest.home_address,
        available: { days: rest.available_days }
      };
    });
    
    return ApiResponse.success({ doctors }, 'Doctors fetched successfully');
  } catch (error) {
    console.error('Fetch Doctors by Clinic Error:', error);
    return ApiResponse.error('Server error', 'SERVER_ERROR', error.message, 500);
  }
}
