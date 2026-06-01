import AuditLog from '@/models/AuditLog';

/**
 * Helper to log critical actions to the AuditLog collection.
 * 
 * @param {Object} options
 * @param {string} options.userId - User performing the action
 * @param {string} options.userRole - Role of the user
 * @param {string} options.userName - Name of the user (optional)
 * @param {string} options.action - Action performed (e.g., 'DELETE', 'EXPORT')
 * @param {string} options.resourceType - The entity type (e.g., 'Doctor', 'Patient')
 * @param {string} options.resourceId - ID of the entity
 * @param {string} options.clinicId - Context clinic ID
 * @param {Object} options.changes - { before: any, after: any }
 * @param {Object} options.metadata - IP, browser info, etc.
 */
export const logAudit = async (options) => {
  try {
    await AuditLog.create(options);
  } catch (error) {
    // We log the error but don't throw, to prevent blocking the main business logic
    console.error('[AUDIT LOG ERROR] Failed to write audit log:', error);
  }
};
