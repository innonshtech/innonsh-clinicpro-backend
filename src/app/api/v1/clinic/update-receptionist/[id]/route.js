import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';
import bcrypt from 'bcryptjs';

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
    const { id } = await params;
    const data = await req.json();

    if (!id) {
      return ApiResponse.error('Receptionist ID is required', 'MISSING_FIELD', [], 400);
    }

    const mappedData = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [
        k.replace(/([A-Z])/g, '_$1').toLowerCase(),
        v
      ])
    );

    if (mappedData.password) {
      mappedData.password = await bcrypt.hash(mappedData.password, 12);
    }

    const { data: updatedStaff, error } = await supabase
      .from('staff')
      .update(mappedData)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw error;
    
    if (!updatedStaff) {
      return ApiResponse.error('Receptionist not found', 'NOT_FOUND', [], 404);
    }

    updatedStaff._id = updatedStaff.id;
    updatedStaff.firstName = updatedStaff.first_name;
    updatedStaff.lastName = updatedStaff.last_name;
    delete updatedStaff.password;

    return ApiResponse.success({ staff: updatedStaff }, 'Receptionist updated successfully');
  } catch (error) {
    console.error('Update Receptionist Error:', error);
    return ApiResponse.error('Server error', 'SERVER_ERROR', error.message, 500);
  }
}

// GET: /api/v1/clinic/update-receptionist/[id]
export async function GET(req, { params }) {
  try {
    const { id } = await params;

    if (!id) {
      return ApiResponse.error('Receptionist ID is required', 'MISSING_FIELD', [], 400);
    }

    const { data: staff, error } = await supabase
      .from('staff')
      .select('*, clinics (clinic_name)')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;

    if (!staff) {
      return ApiResponse.error('Receptionist not found', 'NOT_FOUND', [], 404);
    }

    const staffObj = { 
      ...staff, 
      _id: staff.id,
      firstName: staff.first_name,
      lastName: staff.last_name
    };
    delete staffObj.password;
    
    if (staffObj.clinics) {
      staffObj.clinicName = staffObj.clinics.clinic_name;
    }

    return ApiResponse.success({ staff: staffObj }, 'Receptionist fetched successfully');
  } catch (error) {
    console.error('Fetch Receptionist Error:', error);
    return ApiResponse.error('Server error', 'SERVER_ERROR', error.message, 500);
  }
}
