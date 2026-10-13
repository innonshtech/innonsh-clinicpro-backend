/**
 * ClinicPro Laboratory Role-Based Access Control (RBAC) Constants
 */

export const LAB_ROLES = {
  LAB_ADMIN: 'lab_admin',
  PATHOLOGIST: 'pathologist',
  TECHNICIAN: 'technician',
};

export const LAB_ROLE_DETAILS = {
  [LAB_ROLES.LAB_ADMIN]: {
    id: LAB_ROLES.LAB_ADMIN,
    label: 'Lab Administrator / Director',
    description: 'Full administrative control over staff management, operations, validations, and report issuance.',
    badgeColor: 'indigo'
  },
  [LAB_ROLES.PATHOLOGIST]: {
    id: LAB_ROLES.PATHOLOGIST,
    label: 'Pathologist / Validator',
    description: 'Medical specialist authorized to validate findings, sign off results, and issue diagnostic reports.',
    badgeColor: 'teal'
  },
  [LAB_ROLES.TECHNICIAN]: {
    id: LAB_ROLES.TECHNICIAN,
    label: 'Lab Technician',
    description: 'Technical personnel for sample processing and result entry. Cannot authorize or sign off results.',
    badgeColor: 'blue'
  }
};

export const LAB_PERMISSIONS = {
  MANAGE_STAFF: 'manage_staff',
  MANAGE_ORDERS: 'manage_orders',
  ENTER_RESULTS: 'enter_results',
  VALIDATE_RESULTS: 'validate_results',
  VIEW_REPORTS: 'view_reports',
  ISSUE_REPORTS: 'issue_reports',
  DOWNLOAD_REPORTS: 'download_reports',
  VIEW_BILLING: 'view_billing',
  MANAGE_BILLING: 'manage_billing',
  VIEW_ANALYTICS: 'view_analytics'
};

export const LAB_PERMISSION_DETAILS = {
  [LAB_PERMISSIONS.MANAGE_STAFF]: {
    key: LAB_PERMISSIONS.MANAGE_STAFF,
    label: 'Staff Management & RBAC',
    description: 'Add, edit, activate, deactivate laboratory personnel and assign roles'
  },
  [LAB_PERMISSIONS.MANAGE_ORDERS]: {
    key: LAB_PERMISSIONS.MANAGE_ORDERS,
    label: 'Sample Operations & Tracking',
    description: 'Collect, track, receive specimens and handle recollection workflows'
  },
  [LAB_PERMISSIONS.ENTER_RESULTS]: {
    key: LAB_PERMISSIONS.ENTER_RESULTS,
    label: 'Diagnostic Result Entry',
    description: 'Enter and update raw diagnostic parameter values and observations'
  },
  [LAB_PERMISSIONS.VALIDATE_RESULTS]: {
    key: LAB_PERMISSIONS.VALIDATE_RESULTS,
    label: 'Pathology Signoff & Validation',
    description: 'Authoritative validation, electronic signoff, critical panic acknowledgment, and clinical corrections'
  },
  [LAB_PERMISSIONS.VIEW_REPORTS]: {
    key: LAB_PERMISSIONS.VIEW_REPORTS,
    label: 'View Diagnostic Reports',
    description: 'Access patient report directories and laboratory historical archives'
  },
  [LAB_PERMISSIONS.ISSUE_REPORTS]: {
    key: LAB_PERMISSIONS.ISSUE_REPORTS,
    label: 'Issue & Reissue Reports',
    description: 'Generate finalized diagnostic reports and issue authorized clinical amendments'
  },
  [LAB_PERMISSIONS.DOWNLOAD_REPORTS]: {
    key: LAB_PERMISSIONS.DOWNLOAD_REPORTS,
    label: 'Download Verified PDFs',
    description: 'Generate and stream official tamper-evident laboratory report PDFs'
  },
  [LAB_PERMISSIONS.VIEW_BILLING]: {
    key: LAB_PERMISSIONS.VIEW_BILLING,
    label: 'View Billing & Invoices',
    description: 'Access billing dashboard, invoices directory, and financial summaries'
  },
  [LAB_PERMISSIONS.MANAGE_BILLING]: {
    key: LAB_PERMISSIONS.MANAGE_BILLING,
    label: 'Manage Invoicing & Payments',
    description: 'Generate invoices, record payments, and manage financial transactions'
  },
  [LAB_PERMISSIONS.VIEW_ANALYTICS]: {
    key: LAB_PERMISSIONS.VIEW_ANALYTICS,
    label: 'View Lab Analytics',
    description: 'Access operational analytics, order trends, specimen distributions, and report metrics'
  }
};

export const ROLE_DEFAULT_PERMISSIONS = {
  [LAB_ROLES.LAB_ADMIN]: [
    LAB_PERMISSIONS.MANAGE_STAFF,
    LAB_PERMISSIONS.MANAGE_ORDERS,
    LAB_PERMISSIONS.ENTER_RESULTS,
    LAB_PERMISSIONS.VALIDATE_RESULTS,
    LAB_PERMISSIONS.VIEW_REPORTS,
    LAB_PERMISSIONS.ISSUE_REPORTS,
    LAB_PERMISSIONS.DOWNLOAD_REPORTS,
    LAB_PERMISSIONS.VIEW_BILLING,
    LAB_PERMISSIONS.MANAGE_BILLING,
    LAB_PERMISSIONS.VIEW_ANALYTICS
  ],
  [LAB_ROLES.PATHOLOGIST]: [
    LAB_PERMISSIONS.MANAGE_ORDERS,
    LAB_PERMISSIONS.ENTER_RESULTS,
    LAB_PERMISSIONS.VALIDATE_RESULTS,
    LAB_PERMISSIONS.VIEW_REPORTS,
    LAB_PERMISSIONS.ISSUE_REPORTS,
    LAB_PERMISSIONS.DOWNLOAD_REPORTS,
    LAB_PERMISSIONS.VIEW_ANALYTICS
  ],
  [LAB_ROLES.TECHNICIAN]: [
    LAB_PERMISSIONS.MANAGE_ORDERS,
    LAB_PERMISSIONS.ENTER_RESULTS,
    LAB_PERMISSIONS.VIEW_ANALYTICS
  ]
};

export function isLabAdmin(userOrRole) {
  if (!userOrRole) return false;
  if (typeof userOrRole === 'string') {
    return userOrRole === 'lab' || userOrRole === 'admin' || userOrRole === LAB_ROLES.LAB_ADMIN;
  }
  const labRole = userOrRole.labRole || userOrRole.lab_role;
  return (
    userOrRole.role === 'admin' ||
    userOrRole.role === LAB_ROLES.LAB_ADMIN ||
    labRole === LAB_ROLES.LAB_ADMIN ||
    (userOrRole.role === 'lab' && !labRole && !userOrRole.isStaff)
  );
}

export function isPathologist(userOrRole) {
  if (!userOrRole) return false;
  if (typeof userOrRole === 'string') return userOrRole === LAB_ROLES.PATHOLOGIST;
  const labRole = userOrRole.labRole || userOrRole.lab_role;
  return labRole === LAB_ROLES.PATHOLOGIST;
}

export function isTechnician(userOrRole) {
  if (!userOrRole) return false;
  if (typeof userOrRole === 'string') return userOrRole === LAB_ROLES.TECHNICIAN;
  const labRole = userOrRole.labRole || userOrRole.lab_role;
  return labRole === LAB_ROLES.TECHNICIAN;
}

export function hasLabPermission(userOrRole, permission) {
  if (!userOrRole || !permission) return false;

  // Lab tenant owner or super admin has full permissions
  if (isLabAdmin(userOrRole)) {
    return true;
  }

  // Strict role boundaries:
  // Technicians must NEVER have billing, validation, report issuance, or staff management permissions
  if (isTechnician(userOrRole)) {
    if (
      permission === LAB_PERMISSIONS.VIEW_BILLING ||
      permission === LAB_PERMISSIONS.MANAGE_BILLING ||
      permission === LAB_PERMISSIONS.VALIDATE_RESULTS ||
      permission === LAB_PERMISSIONS.ISSUE_REPORTS ||
      permission === LAB_PERMISSIONS.MANAGE_STAFF
    ) {
      return false;
    }
  }

  // Pathologists must NEVER have staff management or billing permissions
  if (isPathologist(userOrRole)) {
    if (
      permission === LAB_PERMISSIONS.MANAGE_STAFF ||
      permission === LAB_PERMISSIONS.VIEW_BILLING ||
      permission === LAB_PERMISSIONS.MANAGE_BILLING
    ) {
      return false;
    }
  }

  // If object has explicit permissions array
  if (Array.isArray(userOrRole.permissions)) {
    return userOrRole.permissions.includes(permission);
  }

  const labRole = userOrRole.labRole || userOrRole.lab_role;
  const role = typeof userOrRole === 'string' ? userOrRole : labRole || userOrRole.role;
  const defaultPerms = ROLE_DEFAULT_PERMISSIONS[role] || [];
  return defaultPerms.includes(permission);
}

/**
 * Safe and strict role resolver for Laboratory Portal.
 * Prevents staff members with missing or inconsistent role fields from
 * accidentally inheriting Lab Admin privileges.
 */
export function resolveLabPortalRole(user) {
  if (!user) return 'unauthenticated';

  const role = (user.role || '').toLowerCase();
  const rawLabRole = user.labRole || user.lab_role || '';
  const labRole = String(rawLabRole).toLowerCase().trim();
  const isStaff = Boolean(user.isStaff || user.is_staff);

  // 1. Explicit technician match
  if (labRole === 'technician' || isTechnician(user)) {
    return 'technician';
  }

  // 2. Explicit pathologist match
  if (labRole === 'pathologist' || isPathologist(user)) {
    return 'pathologist';
  }

  // 3. Explicit lab admin staff match (if assigned lab_admin role)
  if (labRole === 'lab_admin' && isStaff) {
    return 'lab_admin';
  }

  // 4. Safe fallback for staff users with permissions
  if (isStaff) {
    if (hasLabPermission(user, LAB_PERMISSIONS.VALIDATE_RESULTS)) {
      return 'pathologist';
    }
    if (hasLabPermission(user, LAB_PERMISSIONS.ENTER_RESULTS)) {
      return 'technician';
    }
    // Staff member without operational permissions must NOT get lab admin privileges
    return 'staff_restricted';
  }

  // 5. Tenant Owner / System Admin (Non-staff)
  if ((role === 'lab' || role === 'admin') && !isStaff) {
    return 'lab_admin';
  }

  return 'staff_restricted';
}

