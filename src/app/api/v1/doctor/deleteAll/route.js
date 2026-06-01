import { NextResponse } from 'next/server';
import { ApiResponse } from '@/utils/apiResponse';
import Doctor from '@/models/Doctor';
import dbConnect from '@/utils/db';
import { logAudit } from '@/utils/auditLogger';
import { withRoles } from '@/utils/authGuard';

// Set CORS headers
// DELETE all doctors
/**
 * @swagger
 * /api/v1/doctor/deleteAll:
 *   delete:
 *     summary: DELETE request for /api/v1/doctor/deleteAll
 *     tags: [Doctor]
 *     responses:
 *       200:
 *         description: Successful response
 *       400:
 *         description: Bad Request
 *       500:
 *         description: Internal Server Error
 */
export const DELETE = withRoles(['admin'], async (req, context, user) => {
  try {
    await dbConnect();

    const result = await Doctor.deleteMany({}); // delete all records

    await logAudit({
      userId: user?.id || 'system',
      userRole: user?.role || 'admin',
      action: 'DELETE_ALL',
      resourceType: 'Doctor',
      resourceId: 'ALL',
      clinicId: 'GLOBAL',
      metadata: { deletedCount: result.deletedCount, ip: req.headers.get('x-forwarded-for') }
    });

    return ApiResponse.success({ deletedCount: result.deletedCount }, 'All doctors deleted successfully', 200);
  } catch (error) {
    console.error('Error deleting all doctors:', error);
    return ApiResponse.error('Internal Server Error', undefined, [], 500);
  }
});