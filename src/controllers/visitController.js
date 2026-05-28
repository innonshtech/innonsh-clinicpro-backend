import { ApiResponse } from '@/utils/apiResponse';
import * as visitService from '@/services/visitService';
import { visitCreateSchema, visitUpdateSchema } from '@/validations/userValidation';
import dbConnect from '@/utils/db';

/**
 * Controller to handle starting a consultation (Visit Create).
 */
export const createVisit = async (req) => {
  await dbConnect();

  const body = await req.json();

  // 1. Validate request
  const parsed = visitCreateSchema.safeParse(body);
  if (!parsed.success) {
    console.error('[DEBUG] Validation failed for body:', body);
    console.error('[DEBUG] Validation errors:', parsed.error.issues);
    
    // Dump to file for agent debugging
    try {
      const fs = require('fs');
      fs.writeFileSync('debug_payload.json', JSON.stringify({ body, user: req.user, issues: parsed.error.issues }, null, 2));
    } catch (e) {}

    const firstError = parsed.error.issues[0]?.message || 'Validation failed';
    return ApiResponse.error(
      firstError + " " + JSON.stringify(parsed.error.issues),
      'VALIDATION_ERROR',
      parsed.error.format(),
      400
    );
  }

  try {
    // 2. Call service
    const visit = await visitService.startVisit(parsed.data, req.user);

    // 3. Return success response
    return ApiResponse.success(
      { visit },
      "Visit created and consultation started successfully",
      201
    );
  } catch (error) {
    if (error.message.includes('Appointment not found')) {
      return ApiResponse.error(error.message, 'NOT_FOUND', [], 404);
    }
    if (error.message.includes('already exists')) {
      return ApiResponse.error(error.message, 'DUPLICATE_ENTRY', [], 409);
    }
    if (error.message.includes('Access Denied')) {
      return ApiResponse.error(error.message, 'FORBIDDEN', [], 403);
    }
    if (error.message.includes('Cannot start consultation')) {
      return ApiResponse.error(error.message, 'BAD_REQUEST', [], 400);
    }

    console.error('Error in createVisit controller:', error);
    throw error;
  }
};

/**
 * Controller to handle marking a consultation as completed.
 */
export const completeVisit = async (req, { params }) => {
  await dbConnect();
  const { id } = await params;

  if (!id) {
    return ApiResponse.error('Visit ID is required', 'MISSING_FIELD', [], 400);
  }

  try {
    const body = await req.json().catch(() => ({}));

    // 2. Call service
    const visit = await visitService.finishVisit(id, req.user, body);

    // 3. Return success response
    return ApiResponse.success(
      { visit },
      "Visit marked as completed successfully"
    );
  } catch (error) {
    if (error.message.includes('Visit record not found')) {
      return ApiResponse.error(error.message, 'NOT_FOUND', [], 404);
    }
    if (error.message.includes('already completed')) {
      return ApiResponse.error(error.message, 'BAD_REQUEST', [], 400);
    }
    if (error.message.includes('Access Denied')) {
      return ApiResponse.error(error.message, 'FORBIDDEN', [], 403);
    }

    console.error('Error in completeVisit controller:', error);
    throw error;
  }
};

/**
 * Controller to handle partially updating a visit record (Save Progress).
 */
export const updateVisit = async (req, { params }) => {
  await dbConnect();
  const { id } = await params;
  const body = await req.json();

  if (!id) {
    return ApiResponse.error('Visit ID is required', 'MISSING_FIELD', [], 400);
  }

  // 1. Validate request
  const parsed = visitUpdateSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message || 'Validation failed';
    return ApiResponse.error(firstError, 'VALIDATION_ERROR', parsed.error.format(), 400);
  }

  try {
    // 2. Call service
    const visit = await visitService.updateVisit(id, parsed.data, req.user);

    // 3. Return success response
    return ApiResponse.success({ visit }, "Visit updated successfully");
  } catch (error) {
    if (error.message.includes('Visit record not found')) {
      return ApiResponse.error(error.message, 'NOT_FOUND', [], 404);
    }
    if (error.message.includes('already completed')) {
      return ApiResponse.error(error.message, 'BAD_REQUEST', [], 400);
    }
    if (error.message.includes('Access Denied')) {
      return ApiResponse.error(error.message, 'FORBIDDEN', [], 403);
    }

    console.error('Error in updateVisit controller:', error);
    throw error;
  }
};


/**
 * Controller to handle fetching visit history for a patient.
 */
export const getPatientVisitHistory = async (req, { params }) => {
  await dbConnect();
  const { id } = await params;

  if (!id) {
    return ApiResponse.error('Patient ID is required', 'MISSING_FIELD', [], 400);
  }

  try {
    // 2. Call service
    const visits = await visitService.getPatientVisitHistory(id, req.user);

    // 3. Return success response
    return ApiResponse.success(
      { visits },
      "Patient visit history fetched successfully"
    );
  } catch (error) {
    if (error.message.includes('Patient not found')) {
      return ApiResponse.error(error.message, 'NOT_FOUND', [], 404);
    }

    console.error('Error in getPatientVisitHistory controller:', error);
    throw error;
  }
};

/**
 * Controller to handle saving clinical notes with follow-up details.
 * Maps snake_case payload from Ticket 2 to internal camelCase logic.
 */
export const saveVisitNotes = async (req) => {
  await dbConnect();
  
  try {
    const body = await req.json();
    const { visitNotesSchema } = await import('@/validations/userValidation');
    
    // 1. Validate request
    const parsed = visitNotesSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || 'Validation failed';
      return ApiResponse.error(firstError, 'VALIDATION_ERROR', parsed.error.format(), 400);
    }

    const { visit_id, symptoms, diagnosis, follow_up_date, follow_up_notes } = parsed.data;

    // 2. Map payload to internal structure and call service
    const visit = await visitService.updateVisit(visit_id, {
      symptoms,
      diagnosis,
      followUpDate: follow_up_date,
      followUpNotes: follow_up_notes
    }, req.user);

    return ApiResponse.success({ visit }, "Consultation notes and follow-up saved successfully");
  } catch (error) {
    if (error.message.includes('not found')) return ApiResponse.error(error.message, 'NOT_FOUND', [], 404);
    if (error.message.includes('already completed')) return ApiResponse.error(error.message, 'BAD_REQUEST', [], 400);
    
    console.error('Error in saveVisitNotes controller:', error);
    return ApiResponse.error(error.message, 'INTERNAL_ERROR', [], 500);
  }
};
