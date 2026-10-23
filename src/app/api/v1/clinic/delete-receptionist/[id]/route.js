import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
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

// DELETE: /api/v1/clinic/delete-receptionist/[id]
export const DELETE = withErrorHandler(
  withRoles(['clinic', 'admin'], async (req, { params }) => {
    const { id } = await params;

    if (!id) {
      return ApiResponse.error('Receptionist ID is required', 'MISSING_FIELD', [], 400);
    }

    const store = getLocalStore();
    let existingStaff = (store.staff || []).find(s => s.id === id);

    if (!existingStaff && UUID_REGEX.test(id)) {
      try {
        const { data: dbStaff } = await supabase
          .from('staff')
          .select('id, clinic_id')
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

    try {
      if (UUID_REGEX.test(id)) {
        await supabase
          .from('staff')
          .delete()
          .eq('id', id);
      }
    } catch (_) {}

    store.staff = (store.staff || []).filter(s => s.id !== id);
    saveLocalStore(store);

    return ApiResponse.success(null, 'Receptionist deleted successfully');
  })
);
