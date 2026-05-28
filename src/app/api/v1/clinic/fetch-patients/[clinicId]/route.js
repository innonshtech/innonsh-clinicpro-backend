import { ApiResponse } from '@/utils/apiResponse';
import dbConnect from '@/utils/db';
import Doctor from '@/models/Doctor';
import Appointment from '@/models/Appointments';
import Patient from '@/models/Patient';

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
    await dbConnect();
    const { clinicId } = await params;

    if (!clinicId) {
      return ApiResponse.error('Clinic ID is required', 'MISSING_FIELD', [], 400);
    }

    // 1. Fetch patients directly linked to this clinic
    const directPatients = await Patient.find({ clinicId }).select('-password');

    // 2. Also find all doctors belonging to this clinic to catch patients from appointments
    const doctors = await Doctor.find({ clinicId });
    const doctorIds = doctors.map(d => d._id.toString());

    let allPatients = [...directPatients];

    if (doctorIds.length > 0) {
      // 3. Find all unique patient IDs from appointments with these doctors
      const appointments = await Appointment.find({ doctorId: { $in: doctorIds } });
      const appointmentPatientIds = [...new Set(appointments.map(a => a.patientId).filter(id => id))];
      
      // 4. Fetch these patients if they aren't already in the list
      if (appointmentPatientIds.length > 0) {
        const existingIds = new Set(allPatients.map(p => p._id.toString()));
        const missingIds = appointmentPatientIds.filter(id => !existingIds.has(id.toString()));
        
        if (missingIds.length > 0) {
          const extraPatients = await Patient.find({ _id: { $in: missingIds } }).select('-password');
          allPatients = [...allPatients, ...extraPatients];
        }
      }
    }

    return ApiResponse.success({ patients: allPatients }, 'Patients fetched successfully');

  } catch (error) {
    console.error('Error fetching clinic patients:', error);
    return ApiResponse.error('Server error', 'SERVER_ERROR', error.message, 500);
  }
}