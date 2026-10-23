import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

function getLocalStore() {
  try {
    const storePath = path.resolve(process.cwd(), 'src/storage/ipd_store.json');
    if (fs.existsSync(storePath)) {
      return JSON.parse(fs.readFileSync(storePath, 'utf8'));
    }
  } catch (_) {}
  return { staff: [] };
}

function saveLocalStore(store) {
  try {
    const storePath = path.resolve(process.cwd(), 'src/storage/ipd_store.json');
    const dir = path.dirname(storePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf8');
  } catch (_) {}
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PUT: /api/v1/clinic/update-receptionist/[id]
export const PUT = withErrorHandler(
  withRoles(['clinic', 'admin', 'receptionist'], async (req, { params }) => {
    const { id } = await params;
    let data;
    try { data = await req.json(); } catch (_) {
      return ApiResponse.error('Invalid JSON body', 'BAD_REQUEST', [], 400);
    }

    if (!id) {
      return ApiResponse.error('Receptionist ID is required', 'MISSING_FIELD', [], 400);
    }

    const store = getLocalStore();
    let existingStaff = (store.staff || []).find(s => s.id === id);

    if (!existingStaff && UUID_REGEX.test(id)) {
      try {
        const { data: dbStaff } = await supabase
          .from('staff')
          .select('id, clinic_id, first_name, last_name, email, phone, status, role')
          .eq('id', id)
          .maybeSingle();
        if (dbStaff) existingStaff = dbStaff;
      } catch (_) {}
    }

    if (!existingStaff) {
      return ApiResponse.error('Receptionist not found', 'NOT_FOUND', [], 404);
    }

    if (req.user?.role === 'clinic' && req.user?.clinicId && String(req.user.clinicId) !== String(existingStaff.clinic_id)) {
      return ApiResponse.error('Forbidden: Cross-clinic access prohibited', 'CROSS_CLINIC_FORBIDDEN', [], 403);
    }

    if (req.user?.role === 'receptionist' && req.user?.id && req.user.id !== id && req.user._id !== id) {
      return ApiResponse.error('Forbidden: Cannot edit another receptionist profile', 'FORBIDDEN', [], 403);
    }

    const phoneVal = data.phone !== undefined ? data.phone : data.phoneNumber;
    if (phoneVal !== undefined && phoneVal !== null && String(phoneVal).trim() !== '') {
      let str = String(phoneVal).trim();
      if (str.startsWith('+91')) str = str.slice(3).trim();
      const cleanDigits = str.replace(/\D/g, '');
      const cleanPhone = (cleanDigits.length === 12 && cleanDigits.startsWith('91'))
        ? cleanDigits.slice(2)
        : (cleanDigits.length === 11 && cleanDigits.startsWith('0'))
        ? cleanDigits.slice(1)
        : cleanDigits;

      if (cleanPhone.length !== 10) {
        return ApiResponse.error("Phone number must be exactly 10 digits", "VALIDATION_ERROR", [], 400);
      }
      if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
        return ApiResponse.error("Please enter a valid 10-digit Indian phone number starting with 6, 7, 8, or 9", "VALIDATION_ERROR", [], 400);
      }
      data.phone = cleanPhone;
      if (data.phoneNumber) data.phoneNumber = cleanPhone;
    }

    const mappedData = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [
        k.replace(/([A-Z])/g, '_$1').toLowerCase(),
        v
      ])
    );

    delete mappedData.clinic_id;

    if (mappedData.password) {
      mappedData.password = await bcrypt.hash(mappedData.password, 12);
    }

    let updatedStaff = { ...existingStaff, ...mappedData };

    if (UUID_REGEX.test(id)) {
      try {
        const { data: dbUpdated, error } = await supabase
          .from('staff')
          .update(mappedData)
          .eq('id', id)
          .select()
          .maybeSingle();
        if (!error && dbUpdated) updatedStaff = dbUpdated;
      } catch (_) {}
    }

    const sIdx = (store.staff || []).findIndex(s => s.id === id);
    if (sIdx >= 0) {
      store.staff[sIdx] = updatedStaff;
      saveLocalStore(store);
    }

    updatedStaff._id = updatedStaff.id;
    updatedStaff.firstName = updatedStaff.first_name;
    updatedStaff.lastName = updatedStaff.last_name;
    const avatar = updatedStaff.avatar_url || updatedStaff.photo || updatedStaff.profile_image || updatedStaff.avatarUrl || null;
    updatedStaff.avatarUrl = avatar;
    updatedStaff.photo = avatar;
    updatedStaff.profileImage = avatar;
    delete updatedStaff.password;

    return ApiResponse.success({ staff: updatedStaff }, 'Receptionist updated successfully');
  })
);

// GET: /api/v1/clinic/update-receptionist/[id]
export const GET = withErrorHandler(
  withRoles(['clinic', 'admin', 'receptionist'], async (req, { params }) => {
    const { id } = await params;

    if (!id) {
      return ApiResponse.error('Receptionist ID is required', 'MISSING_FIELD', [], 400);
    }

    const store = getLocalStore();
    let staff = (store.staff || []).find(s => s.id === id);

    if (!staff && UUID_REGEX.test(id)) {
      try {
        const { data: dbStaff } = await supabase
          .from('staff')
          .select('*, clinics (clinic_name)')
          .eq('id', id)
          .maybeSingle();
        if (dbStaff) staff = dbStaff;
      } catch (_) {}
    }

    if (!staff) {
      return ApiResponse.error('Receptionist not found', 'NOT_FOUND', [], 404);
    }

    if (req.user?.role === 'clinic' && req.user?.clinicId && String(req.user.clinicId) !== String(staff.clinic_id)) {
      return ApiResponse.error('Forbidden: Cross-clinic access prohibited', 'CROSS_CLINIC_FORBIDDEN', [], 403);
    }

    if (req.user?.role === 'receptionist' && req.user?.id && req.user.id !== id && req.user._id !== id) {
      return ApiResponse.error('Forbidden: Cannot view another receptionist profile', 'FORBIDDEN', [], 403);
    }

    const avatar = staff.avatar_url || staff.photo || staff.profile_image || staff.avatarUrl || null;
    const staffObj = { 
      ...staff, 
      _id: staff.id,
      firstName: staff.first_name,
      lastName: staff.last_name,
      avatarUrl: avatar,
      photo: avatar,
      profileImage: avatar
    };
    delete staffObj.password;
    
    if (staffObj.clinics) {
      staffObj.clinicName = staffObj.clinics.clinic_name;
    }

    return ApiResponse.success({ staff: staffObj }, 'Receptionist fetched successfully');
  })
);
