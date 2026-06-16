import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';

/**
 * @swagger
 * /api/v1/auth/check-email:
 *   post:
 *     summary: POST request for /api/v1/auth/check-email
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Successful response
 *       400:
 *         description: Bad Request
 *       500:
 *         description: Internal Server Error
 */
export async function POST(req) {
  try {
    const { email } = await req.json();

    if (!email) {
      return ApiResponse.error('Email is required', 'MISSING_EMAIL', [], 400);
    }

    const [adminRes, clinicRes, patientRes, staffRes, doctorRes] = await Promise.all([
      supabase.from('admins').select('role').eq('email', email).maybeSingle(),
      supabase.from('clinics').select('role').eq('email', email).maybeSingle(),
      supabase.from('patients').select('role').eq('email', email).maybeSingle(),
      supabase.from('staff').select('role').eq('email', email).maybeSingle(),
      supabase.from('doctors').select('role').eq('email', email).maybeSingle(),
    ]);

    let existsInAnyCollection = null;
    if (adminRes.data) existsInAnyCollection = { ...adminRes.data, role: adminRes.data.role || 'admin' };
    else if (clinicRes.data) existsInAnyCollection = { ...clinicRes.data, role: clinicRes.data.role || 'clinic' };
    else if (patientRes.data) existsInAnyCollection = { ...patientRes.data, role: patientRes.data.role || 'patient' };
    else if (staffRes.data) existsInAnyCollection = { ...staffRes.data, role: staffRes.data.role || 'receptionist' };
    else if (doctorRes.data) existsInAnyCollection = { ...doctorRes.data, role: doctorRes.data.role || 'doctor' };

    return ApiResponse.success({
      available: !existsInAnyCollection,
      existsIn: existsInAnyCollection ? existsInAnyCollection.role : null,
    }, 'Email check completed');

  } catch (error) {
    console.error('Email check error:', error);
    return ApiResponse.error('Server error', 'SERVER_ERROR', error.message, 500);
  }
}

/**
 * @swagger
 * /api/v1/auth/check-email:
 *   get:
 *     summary: GET request for /api/v1/auth/check-email
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Successful response
 *       400:
 *         description: Bad Request
 *       500:
 *         description: Internal Server Error
 */
export function GET() {
  return ApiResponse.error('Method not allowed', 'METHOD_NOT_ALLOWED', [], 405);
}
