import { supabase } from '@/lib/supabase';
import { ApiResponse } from './apiResponse';

/**
 * Checks if a clinic has a specific module enabled.
 * Default behavior for backward compatibility (existing clinics with null/missing modules):
 * lab: true, ipd: false
 * 
 * @param {string} clinicId 
 * @param {'ipd'|'lab'} moduleName 
 * @returns {Promise<{ enabled: boolean, error?: string, clinic?: any }>}
 */
export async function checkClinicModule(clinicId, moduleName) {
  if (!clinicId) {
    return { enabled: false, error: 'Clinic ID is required' };
  }

  const { data: clinic, error } = await supabase
    .from('clinics')
    .select('id, modules')
    .eq('id', clinicId)
    .maybeSingle();

  if (error || !clinic) {
    return { enabled: false, error: 'Clinic not found' };
  }

  const modules = clinic.modules || {};
  const isLabEnabled = modules.lab !== false; // defaults to true
  const isIpdEnabled = modules.ipd === true;  // defaults to false

  if (moduleName === 'ipd') {
    return { enabled: isIpdEnabled, clinic };
  }

  if (moduleName === 'lab') {
    return { enabled: isLabEnabled, clinic };
  }

  return { enabled: false, error: `Unknown module: ${moduleName}` };
}

/**
 * Require IPD module for a clinic. Returns null if allowed, or an ApiResponse 403 error if not.
 */
export async function requireIpdModule(clinicId) {
  const result = await checkClinicModule(clinicId, 'ipd');
  if (!result.enabled) {
    return ApiResponse.error(
      'Access Denied: The IPD & Bed Management module is not enabled for this clinic.',
      'IPD_MODULE_DISABLED',
      [],
      403
    );
  }
  return null;
}

/**
 * Require Lab module for a clinic. Returns null if allowed, or an ApiResponse 403 error if not.
 */
export async function requireLabModule(clinicId) {
  const result = await checkClinicModule(clinicId, 'lab');
  if (!result.enabled) {
    return ApiResponse.error(
      'Access Denied: The Lab module is not enabled for this clinic.',
      'LAB_MODULE_DISABLED',
      [],
      403
    );
  }
  return null;
}
