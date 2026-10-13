import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { supabase } from '../lib/supabase.js';
import {
  LAB_ROLES,
  LAB_ROLE_DETAILS,
  LAB_PERMISSIONS,
  LAB_PERMISSION_DETAILS,
  ROLE_DEFAULT_PERMISSIONS,
  hasLabPermission
} from '../constants/labRoles.js';

const STAFF_FALLBACK_FILE = path.resolve(process.cwd(), 'data/lab_staff.json');

function ensureStaffFallbackFile() {
  const dir = path.dirname(STAFF_FALLBACK_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(STAFF_FALLBACK_FILE)) {
    fs.writeFileSync(STAFF_FALLBACK_FILE, '[]', 'utf8');
  }
}

function readFallbackStaff() {
  try {
    ensureStaffFallbackFile();
    const data = fs.readFileSync(STAFF_FALLBACK_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    return [];
  }
}

function writeFallbackStaff(staffList) {
  try {
    ensureStaffFallbackFile();
    fs.writeFileSync(STAFF_FALLBACK_FILE, JSON.stringify(staffList, null, 2), 'utf8');
  } catch (err) {
    console.error('[LabStaffService] Error writing fallback staff:', err);
  }
}

let tableCheckedAt = 0;
let tableAvailable = null;

async function checkStaffTableAvailable() {
  const now = Date.now();
  if (tableAvailable === true) return true;
  if (tableAvailable === false && now - tableCheckedAt < 30000) {
    return false;
  }
  try {
    tableCheckedAt = now;
    const { error } = await supabase.from('lab_staff').select('id').limit(1);
    if (!error) {
      tableAvailable = true;
      return true;
    }
    tableAvailable = false;
    return false;
  } catch (e) {
    tableAvailable = false;
    return false;
  }
}

function sanitizeStaffRecord(record) {
  if (!record) return null;
  const { password_hash: _ph, ...clean } = record;
  return clean;
}

export const labStaffService = {
  /**
   * List staff members strictly scoped to the authenticated laboratory tenant.
   */
  async listStaff(labId, { search = '', role = 'all', status = 'all', page = 1, limit = 50 } = {}) {
    if (!labId) throw new Error('Unauthorized: Laboratory identity missing');

    const hasDb = await checkStaffTableAvailable();
    if (hasDb) {
      let q = supabase
        .from('lab_staff')
        .select('*')
        .eq('lab_id', labId)
        .order('created_at', { ascending: false });

      if (role && role !== 'all') {
        q = q.eq('role', role);
      }
      if (status && status !== 'all') {
        q = q.eq('status', status.toLowerCase());
      }

      const { data, error } = await q;
      if (error) {
        throw new Error(`Database error querying lab staff: ${error.message}`);
      }

      let staffList = (data || []).map(sanitizeStaffRecord);
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        staffList = staffList.filter((m) => {
          const fullName = `${m.first_name || ''} ${m.last_name || ''}`.toLowerCase();
          const email = (m.email || '').toLowerCase();
          const phone = (m.phone || '').toLowerCase();
          const roleLabel = (LAB_ROLE_DETAILS[m.role]?.label || m.role || '').toLowerCase();
          const lic = (m.license_number || '').toLowerCase();
          return fullName.includes(s) || email.includes(s) || phone.includes(s) || roleLabel.includes(s) || lic.includes(s);
        });
      }
      return staffList;
    }

    // Fallback store
    const all = readFallbackStaff();
    let filtered = all.filter((m) => m.lab_id === labId);

    if (role && role !== 'all') {
      filtered = filtered.filter((m) => m.role === role);
    }
    if (status && status !== 'all') {
      filtered = filtered.filter((m) => (m.status || 'active').toLowerCase() === status.toLowerCase());
    }

    if (search.trim()) {
      const s = search.trim().toLowerCase();
      filtered = filtered.filter((m) => {
        const fullName = `${m.first_name || ''} ${m.last_name || ''}`.toLowerCase();
        const email = (m.email || '').toLowerCase();
        const phone = (m.phone || '').toLowerCase();
        const roleLabel = (LAB_ROLE_DETAILS[m.role]?.label || m.role || '').toLowerCase();
        const lic = (m.license_number || '').toLowerCase();
        return fullName.includes(s) || email.includes(s) || phone.includes(s) || roleLabel.includes(s) || lic.includes(s);
      });
    }

    // Sort by created_at desc
    filtered.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    return filtered.map(sanitizeStaffRecord);
  },

  /**
   * Get single staff member by ID scoped to authenticated lab.
   */
  async getStaffById(labId, staffId) {
    if (!labId || !staffId) return null;

    const hasDb = await checkStaffTableAvailable();
    if (hasDb) {
      const { data, error } = await supabase
        .from('lab_staff')
        .select('*')
        .eq('id', staffId)
        .eq('lab_id', labId)
        .maybeSingle();

      if (error) {
        throw new Error(`Database error fetching staff member: ${error.message}`);
      }
      return sanitizeStaffRecord(data);
    }

    const all = readFallbackStaff();
    const found = all.find((m) => m.id === staffId && m.lab_id === labId);
    return sanitizeStaffRecord(found);
  },

  /**
   * Add new laboratory staff member under authenticated lab tenant.
   * Enforces email uniqueness within the lab tenant and validates role.
   */
  async createStaff(labId, payload, authUser) {
    if (!labId) throw new Error('Unauthorized: Laboratory identity missing');

    const {
      first_name,
      last_name,
      email,
      phone = '',
      role = LAB_ROLES.TECHNICIAN,
      qualification = '',
      license_number = '',
      password = '',
      permissions = null
    } = payload;

    // 1. Validate required fields
    if (!first_name || !first_name.trim()) throw new Error('First name is required');
    if (!last_name || !last_name.trim()) throw new Error('Last name is required');
    if (!email || !email.trim()) throw new Error('Email address is required');

    const normalizedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      throw new Error('Please enter a valid email address');
    }

    // 2. Validate role
    const validRoles = Object.values(LAB_ROLES);
    if (!validRoles.includes(role)) {
      throw new Error(`Invalid laboratory role: "${role}". Must be one of: ${validRoles.join(', ')}`);
    }

    // 3. Enforce email uniqueness within the same laboratory tenant
    const hasDb = await checkStaffTableAvailable();
    if (hasDb) {
      const { data: existing } = await supabase
        .from('lab_staff')
        .select('id')
        .eq('lab_id', labId)
        .ilike('email', normalizedEmail)
        .maybeSingle();

      if (existing) {
        const err = new Error('A staff member with this email address already exists in your laboratory.');
        err.status = 409;
        throw err;
      }
    } else {
      const all = readFallbackStaff();
      const existing = all.find((m) => m.lab_id === labId && (m.email || '').toLowerCase() === normalizedEmail);
      if (existing) {
        const err = new Error('A staff member with this email address already exists in your laboratory.');
        err.status = 409;
        throw err;
      }
    }

    // 4. Determine permissions
    const assignedPermissions = Array.isArray(permissions) && permissions.length > 0
      ? permissions
      : ROLE_DEFAULT_PERMISSIONS[role] || [];

    // 5. Password hashing (never plaintext)
    let passwordHash = null;
    if (password && password.trim()) {
      passwordHash = await bcrypt.hash(password.trim(), 10);
    }

    const nowIso = new Date().toISOString();
    // 6. Validate phone if provided (optional, but must be exactly 10 numeric digits)
    let sanitizedPhone = '';
    if (phone !== undefined && phone !== null && String(phone).trim() !== '') {
      const trimmedPhone = String(phone).trim();
      if (!/^[0-9]{10}$/.test(trimmedPhone)) {
        throw new Error('Phone number must be exactly 10 numeric digits');
      }
      sanitizedPhone = trimmedPhone;
    }

    const newStaff = {
      id: crypto.randomUUID(),
      lab_id: labId,
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      email: normalizedEmail,
      phone: sanitizedPhone,
      role,
      status: 'active',
      permissions: assignedPermissions,
      qualification: qualification.trim(),
      license_number: license_number.trim(),
      password_hash: passwordHash,
      created_by: authUser?.id || null,
      created_at: nowIso,
      updated_at: nowIso
    };

    if (hasDb) {
      const { error: insErr } = await supabase.from('lab_staff').insert(newStaff);
      if (insErr) {
        throw new Error(`Database error creating staff member: ${insErr.message}`);
      }
    } else {
      const all = readFallbackStaff();
      all.unshift(newStaff);
      writeFallbackStaff(all);
    }

    return sanitizeStaffRecord(newStaff);
  },

  /**
   * Update an existing staff member scoped to authenticated lab tenant.
   */
  async updateStaff(labId, staffId, payload, authUser) {
    if (!labId || !staffId) throw new Error('Lab ID and Staff ID are required');

    const existing = await this.getStaffById(labId, staffId);
    if (!existing) {
      const err = new Error('Staff member not found or access denied');
      err.status = 404;
      throw err;
    }

    const {
      first_name,
      last_name,
      email,
      phone,
      role,
      status,
      qualification,
      license_number,
      password,
      permissions
    } = payload;

    const updates = {
      updated_at: new Date().toISOString()
    };

    if (first_name !== undefined) {
      if (!first_name.trim()) throw new Error('First name cannot be empty');
      updates.first_name = first_name.trim();
    }
    if (last_name !== undefined) {
      if (!last_name.trim()) throw new Error('Last name cannot be empty');
      updates.last_name = last_name.trim();
    }
    if (phone !== undefined) {
      if (phone !== null && String(phone).trim() !== '') {
        const trimmedPhone = String(phone).trim();
        if (!/^[0-9]{10}$/.test(trimmedPhone)) {
          throw new Error('Phone number must be exactly 10 numeric digits');
        }
        updates.phone = trimmedPhone;
      } else {
        updates.phone = '';
      }
    }
    if (qualification !== undefined) {
      updates.qualification = qualification.trim();
    }
    if (license_number !== undefined) {
      updates.license_number = license_number.trim();
    }

    // Role and permission updates
    if (role !== undefined) {
      const validRoles = Object.values(LAB_ROLES);
      if (!validRoles.includes(role)) {
        throw new Error(`Invalid laboratory role: "${role}"`);
      }
      updates.role = role;
      if (permissions === undefined) {
        // Refresh to new role's defaults if custom permissions not provided
        updates.permissions = ROLE_DEFAULT_PERMISSIONS[role] || [];
      }
    }

    if (permissions !== undefined && Array.isArray(permissions)) {
      updates.permissions = permissions;
    }

    if (status !== undefined) {
      const s = status.toLowerCase();
      if (s !== 'active' && s !== 'inactive') {
        throw new Error('Status must be "active" or "inactive"');
      }
      updates.status = s;
    }

    // Email update check
    if (email !== undefined) {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail) throw new Error('Email address cannot be empty');

      if (normalizedEmail !== existing.email.toLowerCase()) {
        const hasDb = await checkStaffTableAvailable();
        if (hasDb) {
          const { data: duplicate } = await supabase
            .from('lab_staff')
            .select('id')
            .eq('lab_id', labId)
            .ilike('email', normalizedEmail)
            .neq('id', staffId)
            .maybeSingle();

          if (duplicate) {
            const err = new Error('Another staff member in your laboratory already uses this email address.');
            err.status = 409;
            throw err;
          }
        } else {
          const all = readFallbackStaff();
          const duplicate = all.find(
            (m) => m.lab_id === labId && m.id !== staffId && (m.email || '').toLowerCase() === normalizedEmail
          );
          if (duplicate) {
            const err = new Error('Another staff member in your laboratory already uses this email address.');
            err.status = 409;
            throw err;
          }
        }
        updates.email = normalizedEmail;
      }
    }

    // Password update
    if (password && password.trim()) {
      updates.password_hash = await bcrypt.hash(password.trim(), 10);
    }

    const hasDb = await checkStaffTableAvailable();
    if (hasDb) {
      const { error: updErr } = await supabase
        .from('lab_staff')
        .update(updates)
        .eq('id', staffId)
        .eq('lab_id', labId);

      if (updErr) {
        throw new Error(`Database error updating staff member: ${updErr.message}`);
      }
    } else {
      const all = readFallbackStaff();
      const idx = all.findIndex((m) => m.id === staffId && m.lab_id === labId);
      if (idx !== -1) {
        all[idx] = { ...all[idx], ...updates };
        writeFallbackStaff(all);
      }
    }

    return await this.getStaffById(labId, staffId);
  },

  /**
   * Toggle staff status between 'active' and 'inactive'.
   */
  async toggleStaffStatus(labId, staffId, authUser) {
    const staff = await this.getStaffById(labId, staffId);
    if (!staff) {
      const err = new Error('Staff member not found or access denied');
      err.status = 404;
      throw err;
    }

    const newStatus = staff.status === 'active' ? 'inactive' : 'active';

    // Safety: prevent deactivating the only active lab admin
    if (newStatus === 'inactive' && staff.role === LAB_ROLES.LAB_ADMIN) {
      const activeAdmins = (await this.listStaff(labId, { role: LAB_ROLES.LAB_ADMIN, status: 'active' }));
      if (activeAdmins.length <= 1) {
        const err = new Error('Cannot deactivate the last active Lab Administrator.');
        err.status = 400;
        throw err;
      }
    }

    return await this.updateStaff(labId, staffId, { status: newStatus }, authUser);
  },

  /**
   * Helper: Return roles metadata and default permissions
   */
  getRolesMetadata() {
    return {
      roles: LAB_ROLES,
      roleDetails: LAB_ROLE_DETAILS,
      permissions: LAB_PERMISSIONS,
      permissionDetails: LAB_PERMISSION_DETAILS,
      defaultPermissions: ROLE_DEFAULT_PERMISSIONS
    };
  },

  /**
   * Find a staff member by email for authentication.
   * Internal only: preserves password_hash for bcrypt validation.
   */
  async findStaffByEmailForAuth(email) {
    if (!email || !email.trim()) return null;
    const normalizedEmail = email.trim().toLowerCase();

    const hasDb = await checkStaffTableAvailable();
    if (hasDb) {
      const { data, error } = await supabase
        .from('lab_staff')
        .select('*')
        .ilike('email', normalizedEmail)
        .maybeSingle();

      if (!error && data) {
        return data; // contains password_hash
      }
    }

    const all = readFallbackStaff();
    const found = all.find((m) => (m.email || '').toLowerCase() === normalizedEmail);
    return found || null;
  },

  /**
   * Find a staff member by ID for session verification and token refresh.
   * Internal only: preserves password_hash.
   */
  async findStaffByIdForAuth(staffId) {
    if (!staffId) return null;

    const hasDb = await checkStaffTableAvailable();
    if (hasDb) {
      const { data, error } = await supabase
        .from('lab_staff')
        .select('*')
        .eq('id', staffId)
        .maybeSingle();

      if (!error && data) {
        return data;
      }
    }

    const all = readFallbackStaff();
    const found = all.find((m) => m.id === staffId);
    return found || null;
  }
};
