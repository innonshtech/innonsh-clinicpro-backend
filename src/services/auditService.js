import AuditLog from '@/models/AuditLog';
import dbConnect from '@/utils/db';

/**
 * Service to record an audit log entry.
 * @param {Object} logData - The log data object
 */
export const recordLog = async (logData) => {
  try {
    await dbConnect();
    
    // We don't await this if we want it to be fire-and-forget, 
    // but for legal/audit it's better to ensure it's saved.
    const log = await AuditLog.create({
      userId: logData.user.id,
      userRole: logData.user.role,
      userName: logData.user.name || 'Unknown',
      action: logData.action,
      resourceType: logData.resourceType,
      resourceId: logData.resourceId,
      clinicId: logData.user.clinicId,
      changes: logData.changes || {},
      metadata: logData.metadata || {}
    });
    
    return log;
  } catch (error) {
    // We don't want an audit failure to crash the main request, but we should log it
    console.error('[AUDIT ERROR] Failed to record audit log:', error);
    return null;
  }
};

/**
 * Fetch logs for a specific clinic (Admin use)
 */
export const getClinicLogs = async (clinicId, filters = {}) => {
  await dbConnect();
  const { resourceType, action, page = 1, limit = 20 } = filters;
  
  const query = { clinicId };
  if (resourceType) query.resourceType = resourceType;
  if (action) query.action = action;

  const logs = await AuditLog.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  const total = await AuditLog.countDocuments(query);

  return {
    logs,
    total,
    totalPages: Math.ceil(total / limit)
  };
};
