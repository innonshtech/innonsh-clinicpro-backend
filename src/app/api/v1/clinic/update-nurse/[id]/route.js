import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { requireIpdModule } from '@/utils/moduleGuard';
import { nurseUpdateSchema, validateNurseEmail } from '@/validations/userValidation';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

const STORAGE_FILE = path.resolve(process.cwd(), 'src/storage/ipd_store.json');
function getLocalStore() {
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      return JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
    }
  } catch (_) {}
  return { staff: [], wards: [], admissions: [] };
}
function saveLocalStore(store) {
  try {
    const dir = path.dirname(STORAGE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (_) {}
}

export const PUT = withErrorHandler(
  withRoles(['clinic', 'admin'], async (req, { params }) => {
    const { id } = await params;
    if (!id) {
      return ApiResponse.error('Nurse ID is required', 'MISSING_FIELD', [], 400);
    }

    const store = getLocalStore();

    // Fetch existing nurse
    let nurse = null;
    try {
      const { data: dbNurse } = await supabase
        .from('staff')
        .select('*')
        .eq('id', id)
        .eq('role', 'nurse')
        .maybeSingle();
      if (dbNurse) nurse = dbNurse;
    } catch (_) {}

    if (!nurse) {
      nurse = (store.staff || []).find(s => s.id === id && s.role === 'nurse');
    }

    if (!nurse) {
      return ApiResponse.error('Nurse not found', 'NOT_FOUND', [], 404);
    }

    // Cross-clinic prevention
    if (req.user?.role === 'clinic' && req.user?.clinicId !== nurse.clinic_id) {
      return ApiResponse.error(
        'Access Denied: You cannot modify nurses belonging to another clinic.',
        'CROSS_CLINIC_FORBIDDEN',
        [],
        403
      );
    }

    // IPD Module enforcement
    const moduleBlock = await requireIpdModule(nurse.clinic_id);
    if (moduleBlock) return moduleBlock;

    let body;
    try {
      body = await req.json();
    } catch (e) {
      return ApiResponse.error('Invalid JSON body', 'BAD_REQUEST', [], 400);
    }

    // Strict Email pre-check if email is being updated
    let validatedEmail = undefined;
    if (body.email !== undefined) {
      const emailCheck = validateNurseEmail(body.email);
      if (!emailCheck.isValid) {
        return ApiResponse.error(
          emailCheck.message || 'Invalid email address format. A valid email is required.',
          emailCheck.code || 'INVALID_EMAIL',
          [],
          400
        );
      }
      validatedEmail = emailCheck.normalizedEmail;
    }

    const parsed = nurseUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return ApiResponse.error(
        'Validation failed',
        'VALIDATION_ERROR',
        parsed.error.format(),
        400
      );
    }

    const updates = {};
    const data = parsed.data;

    // Helper: calculate active patients assigned to this nurse
    const getActivePatientsCount = async () => {
      let count = 0;
      try {
        const { data: dbAdm } = await supabase
          .from('ipd_admissions')
          .select('id')
          .eq('clinic_id', nurse.clinic_id)
          .eq('assigned_nurse_id', nurse.id)
          .eq('status', 'admitted');
        if (dbAdm) count = dbAdm.length;
      } catch (_) {}
      const localCount = (store.admissions || []).filter(
        a => a.clinic_id === nurse.clinic_id && (a.assigned_nurse_id === nurse.id || a.assignedNurseId === nurse.id) && a.status === 'admitted'
      ).length;
      return Math.max(count, localCount);
    };

    // Ward update check
    if (data.wardId && data.wardId !== nurse.ward_id) {
      let ward = null;
      try {
        const { data: dbWard } = await supabase
          .from('wards')
          .select('*')
          .eq('id', data.wardId)
          .eq('clinic_id', nurse.clinic_id)
          .maybeSingle();
        if (dbWard) ward = dbWard;
      } catch (_) {}

      if (!ward) {
        ward = (store.wards || []).find(w => w.id === data.wardId && w.clinic_id === nurse.clinic_id);
      }

      if (!ward) {
        return ApiResponse.error('Assigned ward not found in this clinic.', 'WARD_NOT_FOUND', [], 404);
      }

      if (ward.is_active === false) {
        return ApiResponse.error('Cannot assign nurse to an inactive ward.', 'INACTIVE_WARD', [], 400);
      }

      const activeCount = await getActivePatientsCount();
      if (activeCount > 0) {
        return ApiResponse.error(
          `Cannot change assigned ward: nurse currently has ${activeCount} active inpatient patient(s) in this ward. Reassign or discharge patients first.`,
          'NURSE_HAS_ACTIVE_PATIENTS',
          [],
          400
        );
      }

      updates.ward_id = data.wardId;
    }

    // Status update check
    if (data.status !== undefined && data.status !== nurse.status) {
      if (data.status === 'inactive') {
        const activeCount = await getActivePatientsCount();
        if (activeCount > 0) {
          return ApiResponse.error(
            `Cannot deactivate nurse while they have ${activeCount} active inpatient patient(s). Reassign patients before deactivating.`,
            'NURSE_HAS_ACTIVE_PATIENTS',
            [],
            400
          );
        }
      }
      updates.status = data.status;
    }

    if (validatedEmail !== undefined && validatedEmail !== (nurse.email || '').toLowerCase()) {
      let existingStaff = null;
      try {
        const { data: dbStaff } = await supabase
          .from('staff')
          .select('id, email')
          .eq('email', validatedEmail)
          .neq('id', id)
          .maybeSingle();
        if (dbStaff) existingStaff = dbStaff;
      } catch (_) {}

      if (!existingStaff) {
        existingStaff = (store.staff || []).find(s => s.id !== id && (s.email || '').toLowerCase() === validatedEmail);
      }

      if (existingStaff) {
        return ApiResponse.error('A staff member or nurse with this email already exists.', 'DUPLICATE_EMAIL', [], 409);
      }

      try {
        const [{ data: dbDoctor }, { data: dbAdmin }] = await Promise.all([
          supabase.from('doctors').select('id, email').eq('email', validatedEmail).maybeSingle(),
          supabase.from('admins').select('id, email').eq('email', validatedEmail).maybeSingle()
        ]);
        if (dbDoctor || dbAdmin) {
          return ApiResponse.error('An account with this email already exists.', 'DUPLICATE_EMAIL', [], 409);
        }
      } catch (_) {}

      updates.email = validatedEmail;
    }
    if (data.firstName !== undefined) updates.first_name = data.firstName.trim();
    if (data.lastName !== undefined) updates.last_name = data.lastName.trim();
    if (data.phone !== undefined) updates.phone = data.phone ? String(data.phone).trim() : null;

    if (data.removePhoto) {
      updates.avatar_url = null;
    } else if (data.avatarUrl !== undefined || data.photo !== undefined) {
      updates.avatar_url = data.avatarUrl || data.photo || null;
    }

    if (data.password) {
      if (data.password.length < 6) {
        return ApiResponse.error('Password must be at least 6 characters long', 'VALIDATION_ERROR', [], 400);
      }
      const salt = await bcrypt.genSalt(10);
      updates.password = await bcrypt.hash(data.password, salt);
    }

    let updated = { ...nurse, ...updates };

    try {
      const { data: dbUpdated, error } = await supabase
        .from('staff')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (!error && dbUpdated) {
        updated = dbUpdated;
      }
    } catch (_) {}

    // Update in local store
    if (!store.staff) store.staff = [];
    const sIdx = store.staff.findIndex(s => s.id === id);
    if (sIdx >= 0) {
      store.staff[sIdx] = { ...store.staff[sIdx], ...updates };
    } else {
      store.staff.push(updated);
    }
    saveLocalStore(store);

    const nurseResponse = {
      ...updated,
      _id: updated.id,
      firstName: updated.first_name,
      lastName: updated.last_name,
      clinicId: updated.clinic_id,
      wardId: updated.ward_id,
      avatarUrl: updated.avatar_url || null,
      photo: updated.avatar_url || null
    };
    delete nurseResponse.password;
    delete nurseResponse.password_hash;
    delete nurseResponse.passwordHash;

    return ApiResponse.success({ nurse: nurseResponse }, 'Nurse updated successfully');
  })
);
