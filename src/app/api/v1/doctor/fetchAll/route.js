import { NextResponse } from 'next/server';
import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';

// GET all doctors
/**
 * @swagger
 * /api/v1/doctor/fetchAll:
 *   get:
 *     summary: GET request for /api/v1/doctor/fetchAll
 *     tags: [Doctor]
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
    const { data: doctors, error: docsError } = await supabase
      .from('doctors')
      .select('*')
      .order('created_at', { ascending: false });
    if (docsError) throw docsError;

    // Check leaves for today
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const { data: leaves } = await supabase
      .from('leaves')
      .select('doctor_id')
      .eq('date', dateStr);

    const doctorsOnLeave = new Set((leaves || []).map(l => l.doctor_id));

    const enrichedDoctors = (doctors || []).map(doc => ({
      ...doc,
      _id: doc.id, // Preserve legacy _id for frontend compatibility
      isOnLeave: doctorsOnLeave.has(doc.id),
      firstName: doc.first_name,
      lastName: doc.last_name,
      profileImage: doc.profile_image,
      dateOfBirth: doc.date_of_birth,
      consultantFee: doc.consultant_fee,
      consultationFee: doc.consultant_fee,
      homeAddress: doc.home_address,
      location: doc.location,
      department: doc.department,
      bio: doc.bio,
      availableTime: doc.available_time,
      licenseNumber: doc.license_number,
      hospitalAddress: doc.hospital_address,
      hospitalNumber: doc.hospital_number,
      clinicId: doc.clinic_id,
      sessionTime: doc.session_time,
      degreeCertificate: doc.degree_certificate,
      identityProof: doc.identity_proof,
      supSpeciality: doc.sup_speciality,
      isVerified: doc.is_verified || false,
      emergencyContact: doc.emergency_contact,
      emergencyPhone: doc.emergency_phone,
      emergencyRelationship: doc.emergency_relationship
    }));

    return ApiResponse.success({ doctors: enrichedDoctors });
  } catch (error) {
    console.error('Error fetching doctors:', error);
    return ApiResponse.error(
      'Internal Server Error', 
      'FETCH_ALL_ERROR', 
      error.message, 
      500
    );
  }
}
