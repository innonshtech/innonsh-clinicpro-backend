import * as appointmentService from '@/services/appointmentService';
import { ApiResponse } from '@/utils/apiResponse';
import { 
  appointmentCreateSchema, 
  appointmentListQuerySchema,
  appointmentStatusSchema,
  appointmentCancelSchema,
  appointmentRescheduleSchema
} from '@/validations/userValidation';


/**
 * Controller to handle appointment booking.
 */
export const createAppointment = async (req) => {
  
  const body = await req.json();

  // 1. Validate request
  const parsed = appointmentCreateSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message || 'Validation failed';
    return ApiResponse.error(
      firstError,
      'VALIDATION_ERROR',
      parsed.error.format(),
      400
    );
  }

  try {
    // 2. Call service
    const appointment = await appointmentService.createAppointment(parsed.data, req.user);
    
    return ApiResponse.success(
      appointment, 
      "Appointment booked successfully", 
      201
    );

  } catch (error) {
    // 3. Handle specific service errors
    if (error.code === 'SLOT_OCCUPIED') {
      return ApiResponse.error(error.message, "SLOT_OCCUPIED", [], 409);
    }
    if (error.message.includes('already has a booked appointment')) {
      return ApiResponse.error(error.message, "DOUBLE_BOOKING", [], 400);
    }
    
    console.error('Error in createAppointment controller:', error);
    throw error;
  }
};

/**
 * Controller to fetch paginated and filtered list of appointments.
 */
export const getAppointmentList = async (req) => {
  
  
  // 1. Extract query params safely
  const url = req.nextUrl || new URL(req.url, `http://${req.headers.get('host') || 'localhost'}`);
  const query = Object.fromEntries(url.searchParams.entries());

  // 2. Validate request
  const parsed = appointmentListQuerySchema.safeParse(query);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message || 'Validation failed';
    return ApiResponse.error(
      firstError,
      'VALIDATION_ERROR',
      parsed.error.format(),
      400
    );
  }

  try {
    // 3. Call service
    const result = await appointmentService.getAppointmentList(parsed.data, req.user);
    
    return ApiResponse.success(
      result, 
      "Appointments fetched successfully"
    );

  } catch (error) {
    console.error('Error in getAppointmentList controller:', error);
    throw error;
  }
};

/**
 * Controller to update an appointment status.
 */
export const updateAppointmentStatus = async (req, { params }) => {
  
  const { id } = await params;
  const body = await req.json();

  // 1. Validate request
  const parsed = appointmentStatusSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message || 'Validation failed';
    return ApiResponse.error(
      firstError,
      'VALIDATION_ERROR',
      parsed.error.format(),
      400
    );
  }

  try {
    // 2. Call service
    const appointment = await appointmentService.updateAppointmentStatus(id, parsed.data.status, req.user);
    
    return ApiResponse.success(
      appointment, 
      `Appointment status updated to ${parsed.data.status}`
    );

  } catch (error) {
    if (error.message === 'Appointment not found') {
      return ApiResponse.error(error.message, 'NOT_FOUND', [], 404);
    }
    if (error.message.includes('Access Denied')) {
      return ApiResponse.error(error.message, 'FORBIDDEN', [], 403);
    }

    console.error('Error in updateAppointmentStatus controller:', error);
    throw error;
  }
};

/**
 * Controller to logically cancel an appointment.
 */
export const cancelAppointment = async (req, { params }) => {
  
  const { id } = await params;
  const body = await req.json();

  // 1. Validate request
  const parsed = appointmentCancelSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message || 'Validation failed';
    return ApiResponse.error(
      firstError,
      'VALIDATION_ERROR',
      parsed.error.format(),
      400
    );
  }

  try {
    // 2. Call service
    const appointment = await appointmentService.cancelAppointment(id, parsed.data.reason, req.user);
    
    return ApiResponse.success(
      appointment, 
      "Appointment cancelled successfully"
    );

  } catch (error) {
    if (error.message === 'Appointment not found') {
      return ApiResponse.error(error.message, 'NOT_FOUND', [], 404);
    }
    if (error.message.includes('Access Denied')) {
      return ApiResponse.error(error.message, 'FORBIDDEN', [], 403);
    }

    console.error('Error in cancelAppointment controller:', error);
    throw error;
  }
};

/**
 * Controller to fetch appointment history for a specific patient.
 */
export const getPatientAppointmentHistory = async (req, { params }) => {
  
  const { id: patientId } = await params;

  try {
    // Call service
    const history = await appointmentService.getPatientAppointmentHistory(patientId, req.user);
    
    return ApiResponse.success(
      history, 
      "Patient appointment history fetched successfully"
    );

  } catch (error) {
    if (error.message === 'Patient not found') {
      return ApiResponse.error(error.message, 'NOT_FOUND', [], 404);
    }
    if (error.message.includes('Access Denied')) {
      return ApiResponse.error(error.message, 'FORBIDDEN', [], 403);
    }

    console.error('Error in getPatientAppointmentHistory controller:', error);
    throw error;
  }
};
/**
 * Controller to handle patient check-in.
 */
export const checkInAppointment = async (req, { params }) => {
  
  const { id } = await params;

  try {
    let lateStrategy = 'end_of_queue';
    try {
      const body = await req.json();
      if (body && body.lateStrategy) {
        lateStrategy = body.lateStrategy;
      }
    } catch (e) {
      // Body might be empty, ignore
    }

    // Call service
    const appointment = await appointmentService.checkInAppointment(id, req.user, lateStrategy);
    
    return ApiResponse.success(
      { queue_number: appointment.queueNumber }, 
      "Patient checked in successfully"
    );

  } catch (error) {
    if (error.message === 'Appointment not found') {
      return ApiResponse.error(error.message, 'NOT_FOUND', [], 404);
    }
    if (error.message.includes('Access Denied')) {
      return ApiResponse.error(error.message, 'FORBIDDEN', [], 403);
    }
    if (error.message.includes('already checked in') || error.message.includes('Cannot check in')) {
      return ApiResponse.error(error.message, 'BAD_REQUEST', [], 400);
    }

    console.error('Error in checkInAppointment controller:', error);
    throw error;
  }
};

/**
 * Controller to fetch daily appointments for a doctor.
 */

export const parseTimeSlotToMinutes = (slotStr) => {
  if (!slotStr || typeof slotStr !== 'string') return 9999;
  const startPart = slotStr.split('-')[0].trim();
  const match = startPart.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return 9999;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const modifier = (match[3] || '').toUpperCase();

  if (modifier === 'PM' && hours < 12) hours += 12;
  if (modifier === 'AM' && hours === 12) hours = 0;

  return hours * 60 + minutes;
};

export const compareDoctorAppointments = (a, b) => {
  // 1. Emergency prioritization: Emergency patients always come first
  if (a.is_emergency && !b.is_emergency) return -1;
  if (!a.is_emergency && b.is_emergency) return 1;

  // 2. Appointment status lifecycle ordering
  const statusRank = {
    in_progress: 1,
    checked_in: 2,
    checkedIn: 2,
    booked: 3,
    scheduled: 3,
    pending: 3,
    completed: 4,
    cancelled: 5
  };
  const rankA = statusRank[a.status] || 99;
  const rankB = statusRank[b.status] || 99;
  if (rankA !== rankB) return rankA - rankB;

  // 3. For checked_in / in_progress patients: if clinic issued queue_number exists, order by it
  if (rankA <= 2 && a.queue_number && b.queue_number && a.queue_number !== b.queue_number) {
    return a.queue_number - b.queue_number;
  }

  // 4. Chronological time-slot ordering (using parseTimeSlotToMinutes)
  const timeA = parseTimeSlotToMinutes(a.time_slot);
  const timeB = parseTimeSlotToMinutes(b.time_slot);
  if (timeA !== timeB) return timeA - timeB;

  // 5. Tie-breaker by queue_number or ID
  const qA = a.queue_number || 9999;
  const qB = b.queue_number || 9999;
  if (qA !== qB) return qA - qB;

  return String(a.appointment_id || a.id || '').localeCompare(String(b.appointment_id || b.id || ''));
};

export const getDoctorDailyAppointments = async (req) => {
  

  try {
    const url = req.nextUrl || new URL(req.url, `http://${req.headers.get('host') || 'localhost'}`);
    const date = url.searchParams.get('date');
    const queryDoctorId = url.searchParams.get('doctorId');
    const { id: loggedInId, clinicId, role } = req.user;

    // Use logged-in ID by default, but allow override if admin/receptionist/clinic
    let doctorId = loggedInId;
    if (['admin', 'receptionist', 'clinic'].includes(role.toLowerCase()) && queryDoctorId) {
      doctorId = queryDoctorId;
    }

    if (!doctorId) {
      return ApiResponse.error("Doctor ID is required", "MISSING_FIELD", [], 400);
    }

    const appointments = await appointmentService.fetchDoctorDailyAppointments(doctorId, date, clinicId);

    // Sort appointments with consistent business rules (emergency -> status -> time slot)
    const sorted = [...appointments].sort(compareDoctorAppointments);

    // Assign sequential queue numbers to guarantee continuous sequence without skips or duplicates
    const formattedData = sorted.map((app, idx) => {
      const pObj = (typeof app.patientId === 'object' && app.patientId) ? app.patientId : (app.patients || {});
      const fullName = `${pObj.first_name || ''} ${pObj.last_name || ''}`.trim();
      const patient_name = fullName || app.patient_name || app.patientName || 'Unknown Patient';
      const patient_code = pObj.patient_code || app.patient_code || (app.patient_id ? `#${String(app.patient_id).slice(-6)}` : 'N/A');

      return {
        appointment_id: app._id || app.id,
        patient_name,
        patient_id: app.patientId?._id || app.patient_id || pObj.id,
        patient_code,
        time_slot: app.time_slot || 'Regular',
        status: app.status || 'scheduled',
        queue_number: idx + 1,
        raw_queue_number: app.queue_number || null,
        is_emergency: !!app.is_emergency
      };
    });

    return ApiResponse.success(
      formattedData,
      "Doctor's daily appointments fetched successfully"
    );
  } catch (error) {
    console.error('Error in getDoctorDailyAppointments controller:', error);
    return ApiResponse.error(error.message, 'FETCH_ERROR', [], 500);
  }
};

/**
 * Controller to fetch specific consultation details.
 */
export const getConsultationDetails = async (req, { params }) => {
  
  const { id } = await params;
  
  try {
    const data = await appointmentService.getConsultationDetails(id, req.user);
    return ApiResponse.success(data, "Consultation details fetched successfully");
  } catch (error) {
    console.error("Error in getConsultationDetails:", error);
    if (error.message.includes('not found')) {
      return ApiResponse.error(error.message, 'NOT_FOUND', [], 404);
    }
    return ApiResponse.error(error.message, 'SERVER_ERROR', [], 500);
  }
};

/**
 * Controller to complete a consultation.
 */
export const completeConsultation = async (req, { params }) => {
  
  const { id } = await params;
  const body = await req.json();
  
  try {
    const data = await appointmentService.completeConsultation(id, body, req.user);
    return ApiResponse.success(data, "Consultation completed successfully");
  } catch (error) {
    console.error("Error in completeConsultation:", error);
    if (error.message.includes('already completed') || error.message.includes('not found')) {
      return ApiResponse.error(error.message, 'BAD_REQUEST', [], 400);
    }
    return ApiResponse.error(error.message, 'SERVER_ERROR', [], 500);
  }
};

/**
 * Internal Controller to auto-create follow-up appointments.
 * Maps snake_case payload from Ticket 3 to internal logic.
 */
export const createAutoFollowup = async (req) => {
  
  
  try {
    const body = await req.json();
    
    // Internal mapping
    const data = {
      visitId: body.linked_visit_id,
      patientId: body.patient_id,
      doctorId: body.doctor_id,
      followUpDate: body.date,
      followUpNotes: body.follow_up_notes
    };

    if (!data.visitId || !data.patientId || !data.doctorId || !data.followUpDate) {
      return ApiResponse.error("Missing required fields for auto-followup", "VALIDATION_ERROR", [], 400);
    }

    const appointment = await appointmentService.createAutoFollowup(data, req.user);
    
    return ApiResponse.success(appointment, "Auto-followup appointment processed successfully");
  } catch (error) {
    console.error('Error in createAutoFollowup controller:', error);
    return ApiResponse.error(error.message, 'INTERNAL_ERROR', [], 500);
  }
};

/**
 * Controller to reschedule an appointment.
 */
export const rescheduleAppointment = async (req, { params }) => {
  
  const { id } = await params;
  const body = await req.json();

  // 1. Validate request
  const parsed = appointmentRescheduleSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message || 'Validation failed';
    return ApiResponse.error(
      firstError,
      'VALIDATION_ERROR',
      parsed.error.format(),
      400
    );
  }

  try {
    // 2. Call service
    const appointment = await appointmentService.rescheduleAppointment(id, parsed.data, req.user);
    
    return ApiResponse.success(
      appointment, 
      "Appointment rescheduled successfully"
    );

  } catch (error) {
    if (error.message === 'Appointment not found') {
      return ApiResponse.error(error.message, 'NOT_FOUND', [], 404);
    }
    if (error.message.includes('Access Denied')) {
      return ApiResponse.error(error.message, 'FORBIDDEN', [], 403);
    }
    if (error.message.includes('already has a booked appointment')) {
      return ApiResponse.error(error.message, 'SLOT_OCCUPIED', [], 409);
    }

    console.error('Error in rescheduleAppointment controller:', error);
    throw error;
  }
};
