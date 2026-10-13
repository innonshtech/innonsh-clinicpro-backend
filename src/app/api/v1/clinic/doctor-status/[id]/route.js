import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { withTenant } from '@/utils/tenantMiddleware';

/**
 * @swagger
 * /api/v1/clinic/doctor-status/{id}:
 *   put:
 *     summary: Update doctor active/inactive status (Clinic-scoped)
 *     tags: [Clinic]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *     responses:
 *       200:
 *         description: Status updated successfully
 *       400:
 *         description: Invalid status value
 *       403:
 *         description: Forbidden - Not the owning clinic
 *       404:
 *         description: Doctor not found
 */
async function handleStatusUpdate(req, { params }) {
  const resolvedParams = await params;
  const { id } = resolvedParams;

  if (!id) {
    return ApiResponse.error('Doctor ID is required', 'MISSING_FIELD', [], 400);
  }

  const body = await req.json().catch(() => ({}));
  const rawStatus = body.status;

  if (!rawStatus || typeof rawStatus !== 'string') {
    return ApiResponse.error('Status is required and must be a string', 'INVALID_FIELD', [], 400);
  }

  const normalizedStatus = rawStatus.trim().toLowerCase();
  if (normalizedStatus !== 'active' && normalizedStatus !== 'inactive') {
    return ApiResponse.error(
      'Status must be either "active" or "inactive"',
      'INVALID_STATUS',
      { allowed: ['active', 'inactive'], received: rawStatus },
      400
    );
  }

  // 1. Fetch existing doctor
  const { data: doctor, error: fetchErr } = await supabase
    .from('doctors')
    .select('id, first_name, last_name, email, clinic_id, status')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr) {
    console.error('[Doctor Status Update] Fetch error:', fetchErr);
    throw fetchErr;
  }

  if (!doctor) {
    return ApiResponse.error('Doctor not found', 'DOCTOR_NOT_FOUND', [], 404);
  }

  // 2. Strict Clinic Ownership Verification
  const clinicTenantId = req.tenant_id;
  if (!doctor.clinic_id || doctor.clinic_id !== clinicTenantId) {
    return ApiResponse.error(
      'Forbidden: You can only update the status of doctors belonging to your clinic',
      'FORBIDDEN',
      { doctorClinicId: doctor.clinic_id, yourClinicId: clinicTenantId },
      403
    );
  }

  // 3. Update status in Supabase
  const { data: updatedDoctor, error: updateErr } = await supabase
    .from('doctors')
    .update({ status: normalizedStatus })
    .eq('id', id)
    .select()
    .single();

  if (updateErr) {
    console.error('[Doctor Status Update] Supabase update error:', updateErr);
    throw updateErr;
  }

  delete updatedDoctor.password;
  updatedDoctor._id = updatedDoctor.id;

  return ApiResponse.success(
    { doctor: updatedDoctor },
    'Doctor status updated to ' + normalizedStatus + ' successfully'
  );
}

export const PUT = withErrorHandler(withRoles(['clinic'], withTenant(handleStatusUpdate)));
export const PATCH = withErrorHandler(withRoles(['clinic'], withTenant(handleStatusUpdate)));
