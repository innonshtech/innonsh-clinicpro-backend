import { ApiResponse } from '@/utils/apiResponse';
import * as patientService from '@/services/patientService';
import * as appointmentService from '@/services/appointmentService';
import { patientRegistrationSchema, patientListQuerySchema, patientSearchQuerySchema, patientUpdateSchema } from '@/validations/userValidation';
import dbConnect from '@/utils/db';

import jwt from 'jsonwebtoken';

/**
 * Controller to handle patient registration request.
 */
export const register = async (req) => {
  await dbConnect();
  
  const body = await req.json();

  let user = req.user;
  if (!user) {
    const authHeader = req.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        user = jwt.verify(token.trim(), process.env.JWT_SECRET);
      } catch (e) {
        // Ignore, fall back to public registration
      }
    }
  }

  // Extract clinicId from user if available (staff registration)
  // or from the body if it's a public registration (if provided)
  const clinicId = user?.clinicId || body.clinicId;

  // 1. Validate request
  const parsed = patientRegistrationSchema.safeParse({ ...body, clinicId });
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
    const patientData = await patientService.registerPatient(parsed.data);

    // 3. Return success response
    return ApiResponse.success(
      { patient: patientData }, 
      "Patient registered successfully", 
      201
    );
  } catch (error) {
    // 4. Handle specific service errors (like duplicate checks)
    if (error.message.includes('already registered')) {
      return ApiResponse.error(error.message, "DUPLICATE_ENTRY", [], 400);
    }
    
    throw error;
  }
};

/**
 * Controller to handle fetching paginated patient list.
 */
export const getPatientList = async (req) => {
  await dbConnect();

  // 1. Extract query parameters from URL
  const { searchParams } = new URL(req.url);
  const query = Object.fromEntries(searchParams.entries());

  // 2. Validate query parameters
  const parsed = patientListQuerySchema.safeParse(query);
  if (!parsed.success) {
    return ApiResponse.error(
      'Invalid query parameters',
      'VALIDATION_ERROR',
      parsed.error.format(),
      400
    );
  }

  try {
    // 3. Call service with authenticated user context
    const result = await patientService.getPatients(req.user, parsed.data);

    // 4. Return success response
    return ApiResponse.success(result, "Patients fetched successfully");

  } catch (error) {
    console.error('Error in getPatientList controller:', error);
    throw error;
  }
};

/**
 * Controller to handle fetching a single patient profile.
 */
export const getPatientProfile = async (req, { params }) => {
  await dbConnect();
  const { id } = await params;

  if (!id) {
    return ApiResponse.error('Patient ID is required', 'MISSING_FIELD', [], 400);
  }

  try {
    const patient = await patientService.getPatientById(id, req.user);
    const visits = await appointmentService.getPatientAppointmentHistory(patient._id, req.user);
    
    return ApiResponse.success({ patient, visits }, "Patient profile fetched successfully");

  } catch (error) {
    if (error.message === 'Patient not found') {
      return ApiResponse.error(error.message, 'NOT_FOUND', [], 404);
    }
    if (error.message.includes('Access Denied')) {
      return ApiResponse.error(error.message, 'FORBIDDEN', [], 403);
    }

    console.error('Error in getPatientProfile controller:', error);
    throw error;
  }
};
/**
 * Controller to handle deleting a patient profile.
 */
export const deletePatient = async (req, { params }) => {
  await dbConnect();
  const { id } = await params;

  if (!id) {
    return ApiResponse.error('Patient ID is required', 'MISSING_FIELD', [], 400);
  }

  try {
    await patientService.deletePatient(id, req.user);
    
    return ApiResponse.success(null, "Patient deleted successfully");

  } catch (error) {
    if (error.message === 'Patient not found') {
      return ApiResponse.error(error.message, 'NOT_FOUND', [], 404);
    }
    if (error.message.includes('Access Denied')) {
      return ApiResponse.error(error.message, 'FORBIDDEN', [], 403);
    }

    console.error('Error in deletePatient controller:', error);
    throw error;
  }
};

/**
 * Controller to handle updating a patient profile.
 */
export const updatePatient = async (req, { params }) => {
  await dbConnect();
  const { id } = await params;
  const body = await req.json();

  if (!id) {
    return ApiResponse.error('Patient ID is required', 'MISSING_FIELD', [], 400);
  }

  // 1. Validate update data
  const parsed = patientUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return ApiResponse.error(
      'Validation failed',
      'VALIDATION_ERROR',
      parsed.error.format(),
      400
    );
  }

  try {
    // 2. Call service
    const patient = await patientService.updatePatient(id, parsed.data, req.user);
    
    return ApiResponse.success({ patient }, "Patient updated successfully");

  } catch (error) {
    if (error.message === 'Patient not found') {
      return ApiResponse.error(error.message, 'NOT_FOUND', [], 404);
    }
    if (error.message.includes('Access Denied')) {
      return ApiResponse.error(error.message, 'FORBIDDEN', [], 403);
    }
    if (error.message.includes('already registered')) {
      return ApiResponse.error(error.message, "DUPLICATE_ENTRY", [], 400);
    }

    console.error('Error in updatePatient controller:', error);
    throw error;
  }
};

/**
 * Controller to handle specialized patient search.
 */
export const searchPatients = async (req) => {
  await dbConnect();

  // 1. Extract query parameters
  const { searchParams } = new URL(req.url);
  const query = Object.fromEntries(searchParams.entries());

  // 2. Validate
  const parsed = patientSearchQuerySchema.safeParse(query);
  if (!parsed.success) {
    return ApiResponse.error(
      'Invalid search parameters',
      'VALIDATION_ERROR',
      parsed.error.format(),
      400
    );
  }

  try {
    // 3. Service call
    const result = await patientService.searchPatients(req.user, parsed.data);

    // 4. Success response
    return ApiResponse.success(result, "Search results fetched successfully");

  } catch (error) {
    console.error('Error in searchPatients controller:', error);
    throw error;
  }
};

/**
 * Controller to fetch patient visit history records.
 */
export const getPatientRecords = async (req, { params }) => {
  await dbConnect();
  const { id } = await params;

  if (!id) {
    return ApiResponse.error('Patient ID is required', 'MISSING_FIELD', [], 400);
  }

  try {
    // 3. Service call
    const result = await patientService.getPatientRecords(id, req.user);

    // 4. Success response
    return ApiResponse.success(result, "Patient records fetched successfully");

  } catch (error) {
    if (error.message === 'Patient not found') {
      return ApiResponse.error(error.message, 'NOT_FOUND', [], 404);
    }
    if (error.message.includes('Access Denied')) {
      return ApiResponse.error(error.message, 'FORBIDDEN', [], 403);
    }

    console.error('Error in getPatientRecords controller:', error);
    throw error;
  }
};
