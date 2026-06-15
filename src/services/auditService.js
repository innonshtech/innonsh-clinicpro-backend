/**
 * auditService.js - Audit log management via Supabase.
 * Replaces the old Mongoose AuditLog model.
 */
import { supabase } from '@/lib/supabase';

/**
 * Service to record an audit log entry.
 * @param {Object} logData - The log data object
 */
export const recordLog = async (logData) => {
  try {
    await supabase.from('audit_logs').insert([{
      user_id: logData.user.id || logData.user._id || logData.user.userId,
      user_role: logData.user.role,
      user_name: logData.user.name || 'Unknown',
      action: logData.action,
      resource_type: logData.resourceType,
      resource_id: logData.resourceId,
      clinic_id: logData.user.clinicId,
      changes_before: logData.changes?.before || null,
      changes_after: logData.changes?.after || logData.changes || null,
      metadata: logData.metadata || null,
    }]);
  } catch (error) {
    // We don't want an audit failure to crash the main request
    console.error('[AUDIT ERROR] Failed to record audit log:', error.message);
  }
};

/**
 * Fetch logs for a specific clinic (Admin use)
 */
export const getClinicLogs = async (clinicId, filters = {}) => {
  const { resourceType, action, page = 1, limit = 20 } = filters;

  let req = supabase
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false });

  if (resourceType) req = req.eq('resource_type', resourceType);
  if (action) req = req.eq('action', action);

  const from = (page - 1) * limit;
  req = req.range(from, from + limit - 1);

  const { data: logs, error, count } = await req;
  if (error) throw error;

  return {
    logs: logs || [],
    total: count || 0,
    totalPages: Math.ceil((count || 0) / limit),
  };
};
