import BaseRepository from './BaseRepository';
import { supabase } from '@/lib/supabase';

class PatientRepository extends BaseRepository {
  constructor() {
    super('patients');
  }

  async aggregate(pipeline) {
    // Specifically handle the getPatients aggregation pipeline in patientService.js
    // We expect the pipeline to have a $match stage first.
    const matchStage = pipeline[0]?.$match || {};
    
    // Check if it's the receptionist completed appointments aggregation
    const hasCompletedAppointmentsLookup = pipeline.some(stage => 
      stage.$lookup && stage.$lookup.from === 'appointments'
    );

    let req = supabase.from('patients').select(`
      *,
      appointments!inner (
        appointment_date,
        status,
        doctors (
          first_name,
          last_name
        )
      )
    `);

    // Only filter for completed appointments if the aggregation specifically requested it
    if (hasCompletedAppointmentsLookup) {
      req = req.eq('appointments.status', 'completed');
    }

    if (matchStage.clinicId) {
      req = req.eq('clinic_id', matchStage.clinicId);
    }
    
    // We map search filters
    if (matchStage.$or) {
        const orConditions = matchStage.$or.map(cond => {
          const k = Object.keys(cond)[0];
          const v = cond[k];
          const dbKey = k === 'phoneNumber' ? 'phone_number' : k === 'patientId' ? 'patient_code' : k.replace(/([A-Z])/g, '_$1').toLowerCase();
          if (v instanceof RegExp) {
             return `${dbKey}.ilike.%${v.source.replace(/\^|\$/g,'')}%`;
          }
          return `${dbKey}.eq.${v}`;
        }).join(',');
        req = req.or(orConditions);
    }

    // Sort
    req = req.order('created_at', { ascending: false });

    // Assuming skip and limit are passed in the pipeline's $facet or standalone stages
    let skip = 0;
    let limit = 10;
    
    const facetStage = pipeline.find(p => p.$facet);
    if (facetStage && facetStage.$facet.data) {
      const skipStage = facetStage.$facet.data.find(d => d.$skip !== undefined);
      const limitStage = facetStage.$facet.data.find(d => d.$limit !== undefined);
      if (skipStage) skip = skipStage.$skip;
      if (limitStage) limit = limitStage.$limit;
    }

    // In Supabase, if we fetch all matching rows we can then paginate manually or use .range()
    // However, inner join with appointments might duplicate patients, so we need to deduplicate.
    // A raw query via RPC would be safer, but for zero-touch migration via wrapper:
    
    const { data, error } = await req;
    if (error) throw error;

    // Deduplicate patients and map back to expected aggregation output format
    const uniquePatients = [];
    const patientMap = new Map();

    for (const row of data || []) {
      if (!patientMap.has(row.id)) {
        // Map back to camelCase
        const mapped = {
           _id: row.id,
           patientId: row.id,
           firstName: row.first_name,
           lastName: row.last_name,
           phoneNumber: row.phone_number,
           email: row.email,
           createdAt: row.created_at,
           clinicId: row.clinic_id
        };
        
        // Find last completed appointment
        const completedAppts = row.appointments?.filter(a => a.status === 'completed') || [];
        completedAppts.sort((a,b) => new Date(b.appointment_date) - new Date(a.appointment_date));
        
        if (completedAppts.length > 0) {
           const lastAppt = completedAppts[0];
           mapped.lastVisit = lastAppt.appointment_date;
           mapped.doctor = lastAppt.doctors ? `Dr. ${lastAppt.doctors.first_name} ${lastAppt.doctors.last_name}` : null;
        }

        patientMap.set(row.id, mapped);
        uniquePatients.push(mapped);
      }
    }

    const totalCount = uniquePatients.length;
    const paginatedData = uniquePatients.slice(skip, skip + limit);

    return [{
      metadata: [{ totalCount }],
      data: paginatedData
    }];
  }
}

export default new PatientRepository();
