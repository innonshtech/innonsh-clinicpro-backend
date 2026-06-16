import { supabase } from '@/lib/supabase';
import AppError from '@/utils/AppError';
import * as auditService from '@/services/auditService';

/**
 * Service to add a prescription to an ongoing or completed visit.
 */
export const addPrescription = async (payload, user) => {
  const { visit_id, medicines } = payload;
  
  if (!visit_id) throw new AppError('Invalid Visit ID format', 400, 'INVALID_ID');

  const { data: visit, error: visitError } = await supabase
    .from('visits')
    .select('*')
    .eq('id', visit_id)
    .single();
    
  if (visitError || !visit) throw new AppError('Visit not found', 404, 'NOT_FOUND');

  // Enforce Scoping
  if (user.role.toLowerCase() === 'doctor' && visit.doctor_id !== user.id) {
    throw new AppError('Access Denied', 403, 'FORBIDDEN');
  }

  // Update medicines array
  const { error: updateVisitError } = await supabase
    .from('visits')
    .update({ medicines })
    .eq('id', visit.id);
    
  if (updateVisitError) throw new AppError('Failed to update visit', 500, 'DB_ERROR');

  // Also update the underlying appointment so the legacy history views keep working instantly
  if (visit.appointment_id) {
    await supabase
      .from('appointments')
      .update({ medicines })
      .eq('id', visit.appointment_id);
  }

  visit.medicines = medicines;
  visit._id = visit.id;

  // Audit Log
  await auditService.recordLog({
    user,
    action: 'CREATE_PRESCRIPTION',
    resourceType: 'Visit',
    resourceId: visit.id,
    changes: {
      medicinesCount: (medicines || []).length
    }
  });

  return visit;
};
