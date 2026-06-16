import { NextResponse } from 'next/server';
import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';

// OPTIONS for CORS
export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}

// GET /api/appointment/fetch-checkin-with-medicines/[patientId]
/**
 * @swagger
 * /api/v1/appointment/fetch-checkin-by-id/{id}:
 *   get:
 *     summary: GET request for /api/v1/appointment/fetch-checkin-by-id/{id}
 *     tags: [Appointment]
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
  const { id } = await params;

  try {
    const { data: appointments, error } = await supabase
      .from('appointments')
      .select('*, doctors:doctor_id (*)')
      .eq('patient_id', id)
      .not('medicines', 'is', null);

    if (error) throw error;

    const filteredAppointments = (appointments || []).filter(app => {
      // JSONB might parse to array
      if (Array.isArray(app.medicines)) {
        return app.medicines.length > 0;
      }
      return false;
    });

    const appointmentsWithDoctor = filteredAppointments.map(app => {
      const { doctors, ...rest } = app;
      
      const doctorDetails = doctors ? {
        ...doctors,
        _id: doctors.id,
        firstName: doctors.first_name,
        lastName: doctors.last_name,
      } : null;

      return {
        ...rest,
        _id: rest.id,
        patientId: rest.patient_id,
        doctorId: rest.doctor_id,
        clinicId: rest.clinic_id,
        appointmentDate: rest.appointment_date,
        timeSlot: rest.time_slot,
        doctorDetails
      };
    });

    const response = ApiResponse.success({
      success: true,
      data: appointmentsWithDoctor,
    });
    return response;
  } catch (error) {
    const response = ApiResponse.success({
      success: false,
      error: error.message,
    }, { status: 500 });
    return response;
  }
}