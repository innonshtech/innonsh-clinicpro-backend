import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';

// GET doctor by ID
/**
 * @swagger
 * /api/v1/doctor/fetch-by-id/{id}:
 *   get:
 *     summary: GET request for /api/v1/doctor/fetch-by-id/{id}
 *     tags: [Doctor]
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
      return ApiResponse.error('Doctor ID is required', 'MISSING_FIELD', [], 400);
    }

    const { data: doctor, error } = await supabase
      .from('doctors')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;

    if (!doctor) {
      return ApiResponse.error('Doctor not found', 'NOT_FOUND', [], 404);
    }

    // Map snake_case to camelCase
    const mappedDoctor = {
      ...doctor,
      _id: doctor.id,
      firstName: doctor.first_name,
      lastName: doctor.last_name,
      clinicId: doctor.clinic_id,
      availableDays: doctor.available_days,
      sessionTime: doctor.session_time,
      patientLoad: doctor.patient_load,
      consultationFee: doctor.consultation_fee,
      consultantFee: doctor.consultation_fee,
      profileImage: doctor.profile_image,
      dateOfBirth: doctor.date_of_birth,
      licenseNumber: doctor.license_number,
      hospitalAddress: doctor.hospital_address,
      supSpeciality: doctor.sup_speciality,
      homeAddress: doctor.home_address,
      startTime: doctor.start_time,
      endTime: doctor.end_time
    };
    
    delete mappedDoctor.password;

    return ApiResponse.success({ doctor: mappedDoctor }, 'Doctor fetched successfully');
  } catch (error) {
    console.error('Error fetching doctor:', error);
    return ApiResponse.error('Internal Server Error', 'SERVER_ERROR', error.message, 500);
  }
}
