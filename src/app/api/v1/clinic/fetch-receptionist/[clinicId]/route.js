// /app/api/staff/by-clinic/[clinicId]/route.js

import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';

// GET: /api/v1/clinic/fetch-receptionist/[clinicId]
/**
 * @swagger
 * /api/v1/clinic/fetch-receptionist/{clinicId}:
 *   get:
 *     summary: GET request for /api/v1/clinic/fetch-receptionist/{clinicId}
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

    const { data: staffList, error } = await supabase
      .from('staff')
      .select('*')
      .eq('clinic_id', clinicId);

    if (error) throw error;

    if (!staffList || staffList.length === 0) {
      return ApiResponse.success({ staff: [] }, 'No staff found for this clinic.');
    }

    const staff = staffList.map(s => ({
      ...s,
      _id: s.id,
      firstName: s.first_name,
      lastName: s.last_name,
      clinicId: s.clinic_id
    }));

    return ApiResponse.success({ staff }, 'Staff fetched successfully');
  } catch (error) {
    console.error('Error fetching staff by clinicId:', error);
    return ApiResponse.error('Server error. Please try again later.', 'SERVER_ERROR', error.message, 500);
  }
}