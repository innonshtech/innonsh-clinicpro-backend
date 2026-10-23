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
  return { patients: [] };
}

// GET: /api/v1/clinic/fetch-patients/[clinicId]
export const GET = withErrorHandler(
  withRoles(['clinic', 'admin', 'doctor', 'receptionist'], async (req, { params }) => {
    const { clinicId } = await params;

    if (!clinicId) {
      return ApiResponse.error('Clinic ID is required', 'MISSING_FIELD', [], 400);
    }

    if (req.user?.role === 'clinic' && req.user?.clinicId && String(req.user.clinicId) !== String(clinicId)) {
      return ApiResponse.error('Forbidden: Cross-clinic access prohibited', 'CROSS_CLINIC_FORBIDDEN', [], 403);
    }

    let allPatients = [];

    // 1. Fetch patients directly linked to this clinic in Supabase
    try {
      const { data: directPatients, error: pError } = await supabase
        .from('patients')
        .select('*')
        .eq('clinic_id', clinicId);

      if (!pError && directPatients) {
        allPatients = [...directPatients];
      }
    } catch (dbErr) {
      console.warn('Supabase patients query fallback:', dbErr.message);
    }

    // 2. Fetch all appointments in this clinic to catch cross-clinic patients
    try {
      const { data: appointments, error: aError } = await supabase
        .from('appointments')
        .select('patient_id')
        .eq('clinic_id', clinicId);

      if (!aError && appointments && appointments.length > 0) {
        const appointmentPatientIds = [...new Set(appointments.map(a => a.patient_id).filter(Boolean))];
        const existingIds = new Set(allPatients.map(p => p.id));
        const missingIds = appointmentPatientIds.filter(id => !existingIds.has(id));

        if (missingIds.length > 0) {
          const { data: extraPatients } = await supabase
            .from('patients')
            .select('*')
            .in('id', missingIds);

          if (extraPatients) {
            allPatients = [...allPatients, ...extraPatients];
          }
        }
      }
    } catch (_) {}

    // 3. Fallback and merge from local store for hybrid/local development
    const store = getLocalStore();
    const localPatients = (store.patients || []).filter(p => p.clinic_id === clinicId || p.clinicId === clinicId);
    for (const lp of localPatients) {
      const lpId = lp.id || lp._id;
      if (!allPatients.some(p => (p.id || p._id) === lpId)) {
        allPatients.push(lp);
      }
    }

    // Preserve uniform formatting for frontend consumption
    allPatients = allPatients.map(p => {
      const id = p.id || p._id;
      const mapped = { 
        ...p, 
        id,
        _id: id,
        patientId: id,
        firstName: p.first_name || p.firstName || '',
        lastName: p.last_name || p.lastName || '',
        first_name: p.first_name || p.firstName || '',
        last_name: p.last_name || p.lastName || '',
        phoneNumber: p.phone_number || p.phoneNumber || p.phone || '',
        phone_number: p.phone_number || p.phoneNumber || p.phone || '',
        patientCode: p.patient_code || p.patientCode || id,
        patient_code: p.patient_code || p.patientCode || id,
        bloodGroup: p.blood_group || p.bloodGroup || '',
        dateOfBirth: p.date_of_birth || p.dateOfBirth || '',
        clinicId: p.clinic_id || p.clinicId || clinicId,
        clinic_id: p.clinic_id || p.clinicId || clinicId
      };
      delete mapped.password;
      return mapped;
    });

    return ApiResponse.success({ patients: allPatients }, 'Patients fetched successfully');
  })
);
