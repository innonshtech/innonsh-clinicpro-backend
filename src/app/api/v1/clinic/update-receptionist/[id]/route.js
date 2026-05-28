import { ApiResponse } from '@/utils/apiResponse';
import dbConnect from '@/utils/db';
import Staff from '@/models/Staff';
import Clinic from '@/models/Clinic';

// PUT: /api/v1/clinic/update-receptionist/[id]
/**
 * @swagger
 * /api/v1/clinic/update-receptionist/{id}:
 *   put:
 *     summary: PUT request for /api/v1/clinic/update-receptionist/{id}
 *     tags: [Clinic]
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
export async function PUT(req, { params }) {
  try {
    await dbConnect();
    const { id } = await params;
    const data = await req.json();

    if (!id) {
      return ApiResponse.error('Receptionist ID is required', 'MISSING_FIELD', [], 400);
    }

    const updatedStaff = await Staff.findByIdAndUpdate(id, data, { new: true });
    
    if (!updatedStaff) {
      return ApiResponse.error('Receptionist not found', 'NOT_FOUND', [], 404);
    }

    return ApiResponse.success({ staff: updatedStaff }, 'Receptionist updated successfully');
  } catch (error) {
    console.error('Update Receptionist Error:', error);
    return ApiResponse.error('Server error', 'SERVER_ERROR', error.message, 500);
  }
}

// GET: /api/v1/clinic/update-receptionist/[id]
export async function GET(req, { params }) {
  try {
    await dbConnect();
    const { id } = await params;

    if (!id) {
      return ApiResponse.error('Receptionist ID is required', 'MISSING_FIELD', [], 400);
    }

    const staff = await Staff.findById(id);
    if (!staff) {
      return ApiResponse.error('Receptionist not found', 'NOT_FOUND', [], 404);
    }
    const staffObj = staff.toObject();
    if (staffObj.clinicId) {
      const clinicObj = await Clinic.findById(staffObj.clinicId);
      if (clinicObj) {
        staffObj.clinicName = clinicObj.clinicName;
      }
    }

    return ApiResponse.success({ staff: staffObj }, 'Receptionist fetched successfully');
  } catch (error) {
    console.error('Fetch Receptionist Error:', error);
    return ApiResponse.error('Server error', 'SERVER_ERROR', error.message, 500);
  }
}
