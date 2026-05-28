import { ApiResponse } from '@/utils/apiResponse';
import dbConnect from '@/utils/db';
import Admin from '@/models/Admin';
import Clinic from '@/models/Clinic';
import Patient from '@/models/Patient';
import Staff from '@/models/Staff';
import Doctor from '@/models/Doctor';

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
    await dbConnect();
    const { email } = await req.json();

    if (!email) {
      return ApiResponse.error('Email is required', 'MISSING_EMAIL', [], 400);
    }

    const [adminExists, clinicExists, patientExists, staffExists, doctorExists] = await Promise.all([
      Admin.findOne({ email }),
      Clinic.findOne({ email }),
      Patient.findOne({ email }),
      Staff.findOne({ email }),
      Doctor.findOne({ email }),
    ]);

    const existsInAnyCollection = adminExists || clinicExists || patientExists || staffExists || doctorExists;

    return ApiResponse.success({
      available: !existsInAnyCollection,
      existsIn: existsInAnyCollection ? existsInAnyCollection.role || 'unknown' : null,
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
