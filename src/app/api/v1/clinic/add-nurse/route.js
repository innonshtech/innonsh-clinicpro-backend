import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { requireIpdModule } from '@/utils/moduleGuard';
import { nurseCreateSchema, nurseEmailRegex, validateNursePassword, validateNurseEmail } from '@/validations/userValidation';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

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

export const POST = withErrorHandler(
  withRoles(['clinic', 'admin'], async (req) => {
    let body;
    try { body = await req.json(); } catch (e) {
      return ApiResponse.error('Invalid JSON body', 'BAD_REQUEST', [], 400);
    }

    // Early IPD module check
    const targetClinicId = body.clinicId || (req.user?.role === 'clinic' ? req.user?.clinicId : null);
    if (targetClinicId) {
      const moduleBlock = await requireIpdModule(targetClinicId);
      if (moduleBlock) return moduleBlock;
    }

    // 1. Strict Email Validation (Pre-check for specific error code)
    const emailCheck = validateNurseEmail(body.email);
    if (!emailCheck.isValid) {
      return ApiResponse.error(
        emailCheck.message || 'Invalid email address format. A valid, well-formed email is required for nurse login.',
        emailCheck.code || 'INVALID_EMAIL',
        [],
        400
      );
    }
    const rawEmail = emailCheck.normalizedEmail;

    // 2. Strong Password Validation (Pre-check for specific error code)
    const passwordCheck = validateNursePassword(body.password);
    if (!passwordCheck.isValid) {
      return ApiResponse.error(
        passwordCheck.message || 'Password is too weak. Must be at least 8 characters long with uppercase, lowercase, number, and special character.',
        passwordCheck.code || 'WEAK_PASSWORD',
        [],
        400
      );
    }

    // 3. Schema validation
    const parsed = nurseCreateSchema.safeParse({ ...body, email: rawEmail });
    if (!parsed.success) {
      return ApiResponse.error('Validation failed', 'VALIDATION_ERROR', parsed.error.format(), 400);
    }

    const data = parsed.data;

    // 4. Clinic tenant isolation
    if (req.user?.role === 'clinic' && req.user?.clinicId !== data.clinicId) {
      return ApiResponse.error('Access Denied: You cannot create nurses for another clinic.', 'CROSS_CLINIC_FORBIDDEN', [], 403);
    }

    const moduleBlock = await requireIpdModule(data.clinicId);
    if (moduleBlock) return moduleBlock;

    const store = getLocalStore();

    // 5. Validate assigned ward exists, belongs to clinic, and is active
    let ward = null;
    try {
      const { data: dbWard } = await supabase
        .from('wards')
        .select('*')
        .eq('id', data.wardId)
        .eq('clinic_id', data.clinicId)
        .maybeSingle();
      if (dbWard) ward = dbWard;
    } catch (_) {}

    if (!ward) {
      ward = (store.wards || []).find(w => w.id === data.wardId && w.clinic_id === data.clinicId);
    }

    if (!ward) {
      return ApiResponse.error('Assigned ward not found in this clinic.', 'WARD_NOT_FOUND', [], 404);
    }

    if (ward.is_active === false) {
      return ApiResponse.error('Cannot assign nurse to an inactive ward.', 'INACTIVE_WARD', [], 400);
    }

    // 6. Duplicate email check across staff and users
    let existingStaff = null;
    try {
      const { data: dbStaff } = await supabase
        .from('staff')
        .select('id, email')
        .eq('email', rawEmail)
        .maybeSingle();
      if (dbStaff) existingStaff = dbStaff;
    } catch (_) {}

    if (!existingStaff) {
      existingStaff = (store.staff || []).find(s => (s.email || '').toLowerCase() === rawEmail);
    }

    if (existingStaff) {
      return ApiResponse.error('A staff member or nurse with this email already exists.', 'DUPLICATE_EMAIL', [], 409);
    }

    // Also check other user tables to avoid account collisions
    try {
      const [{ data: dbDoctor }, { data: dbAdmin }] = await Promise.all([
        supabase.from('doctors').select('id, email').eq('email', rawEmail).maybeSingle(),
        supabase.from('admins').select('id, email').eq('email', rawEmail).maybeSingle()
      ]);
      if (dbDoctor || dbAdmin) {
        return ApiResponse.error('An account with this email already exists.', 'DUPLICATE_EMAIL', [], 409);
      }
    } catch (_) {}

    // 7. Secure password hashing
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(data.password, salt);

    const nurseId = crypto.randomUUID ? crypto.randomUUID() : ('nurse-' + Date.now());
    const avatarUrl = data.avatarUrl || data.photo || null;

    const staffPayload = {
      id: nurseId,
      first_name: data.firstName.trim(),
      last_name: data.lastName.trim(),
      email: rawEmail,
      phone: data.phone ? String(data.phone).trim() : null,
      password: hashedPassword,
      clinic_id: data.clinicId,
      ward_id: data.wardId,
      role: 'nurse',
      status: data.status || 'active',
      avatar_url: avatarUrl,
      created_at: new Date().toISOString()
    };

    let createdNurse = staffPayload;
    try {
      const { data: dbCreated, error } = await supabase
        .from('staff')
        .insert([staffPayload])
        .select()
        .single();
      if (!error && dbCreated) {
        createdNurse = dbCreated;
      }
    } catch (_) {}

    if (!store.staff) store.staff = [];
    store.staff.push(staffPayload);
    saveLocalStore(store);

    const nurseResponse = {
      ...createdNurse,
      _id: createdNurse.id,
      firstName: createdNurse.first_name,
      lastName: createdNurse.last_name,
      clinicId: createdNurse.clinic_id,
      wardId: createdNurse.ward_id,
      wardName: ward.name,
      avatarUrl: createdNurse.avatar_url || null,
      photo: createdNurse.avatar_url || null
    };
    delete nurseResponse.password;
    delete nurseResponse.password_hash;
    delete nurseResponse.passwordHash;

    return ApiResponse.success({ nurse: nurseResponse }, 'Nurse created successfully', 201);
  })
);
