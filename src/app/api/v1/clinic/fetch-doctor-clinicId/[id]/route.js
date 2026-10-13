import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';
import { jwtVerify } from 'jose';

// GET doctors by clinic ID
/**
 * @swagger
 * /api/v1/clinic/fetch-doctor-clinicId/{id}:
 *   get:
 *     summary: GET doctors by clinic ID with tenant privacy protection
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
 *       403:
 *         description: Forbidden - Cross-clinic access attempt
 *       500:
 *         description: Internal Server Error
 */
export async function GET(req, { params }) {
  try {
    const { id } = await params;

    if (!id) {
      return ApiResponse.error('Clinic ID is required', 'MISSING_FIELD', [], 400);
    }

    // Inspect Authorization header if present
    const authHeader = req.headers.get('authorization');
    let authenticatedUser = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1].trim();
      const JWT_SECRET = process.env.JWT_SECRET;
      if (JWT_SECRET) {
        try {
          const secretKey = new TextEncoder().encode(JWT_SECRET);
          const { payload } = await jwtVerify(token, secretKey);
          authenticatedUser = payload;
        } catch (e) {
          // Token invalid or expired - proceed as unauthenticated public
        }
      }
    }

    // Tenant privacy validation:
    // If authenticated as a clinic, ensure they are requesting THEIR OWN clinic's doctors
    if (authenticatedUser && authenticatedUser.role) {
      const role = authenticatedUser.role.toLowerCase();
      if (role === 'clinic') {
        const callerClinicId = authenticatedUser.clinicId || authenticatedUser.id;
        if (callerClinicId && callerClinicId !== id) {
          return ApiResponse.error(
            'Forbidden: You can only view doctors belonging to your clinic',
            'FORBIDDEN',
            { requestedClinicId: id, yourClinicId: callerClinicId },
            403
          );
        }
      }
    }

    let query = supabase
      .from('doctors')
      .select('*')
      .eq('clinic_id', id);

    // If caller is unauthenticated (e.g. public website visitor on /clinics/[id]),
    // return only active doctors
    const isClinicOwner = authenticatedUser && authenticatedUser.role && 
      (authenticatedUser.role.toLowerCase() === 'clinic' || authenticatedUser.role.toLowerCase() === 'admin');

    if (!isClinicOwner) {
      query = query.eq('status', 'active');
    }

    const { data: doctorsData, error } = await query;

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
