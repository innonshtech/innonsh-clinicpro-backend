import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';

// GET: /api/v1/clinic/fetch-patients/[clinicId]
/**
 * @swagger
 * /api/v1/clinic/fetch-patients/{clinicId}:
 *   get:
 *     summary: GET request for /api/v1/clinic/fetch-patients/{clinicId}
 *     tags: [Clinic]
 *     parameters:
 *       - in: path
 *         name: clinicId
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
    const { clinicId } = await params;

    if (!clinicId) {
      return ApiResponse.error('Clinic ID is required', 'MISSING_FIELD', [], 400);
    }

    // 1. Fetch patients directly linked to this clinic
    const { data: directPatients, error: pError } = await supabase
      .from('patients')
      .select('*')
      .eq('clinic_id', clinicId);
      
    if (pError) throw pError;

    // 2. Fetch all appointments in this clinic to catch cross-clinic patients
    const { data: appointments, error: aError } = await supabase
      .from('appointments')
      .select('patient_id')
      .eq('clinic_id', clinicId);
      
    if (aError) throw aError;

    let allPatients = [...(directPatients || [])];

    const appointmentPatientIds = [...new Set((appointments || []).map(a => a.patient_id).filter(id => id))];
    const existingIds = new Set(allPatients.map(p => p.id));
    const missingIds = appointmentPatientIds.filter(id => !existingIds.has(id));
    
    if (missingIds.length > 0) {
      // 3. Fetch missing patients
      const { data: extraPatients } = await supabase
        .from('patients')
        .select('*')
        .in('id', missingIds);
        
      allPatients = [...allPatients, ...(extraPatients || [])];
    }

    // Preserve legacy formatting for frontend
    allPatients = allPatients.map(p => {
      const mapped = { 
        ...p, 
        _id: p.id,
        patientId: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        phoneNumber: p.phone_number,
        patientCode: p.patient_code,
        bloodGroup: p.blood_group,
        dateOfBirth: p.date_of_birth,
        clinicId: p.clinic_id
      };
      delete mapped.password;
      return mapped;
    });

    return ApiResponse.success({ patients: allPatients }, 'Patients fetched successfully');

  } catch (error) {
    console.error('Error fetching clinic patients:', error);
    return ApiResponse.error('Server error', 'SERVER_ERROR', error.message, 500);
  }
}