import BaseRepository from './BaseRepository';
import { supabase } from '@/lib/supabase';

class BillingRepository extends BaseRepository {
  constructor() {
    super('billings');
  }

  async findByIdWithDetails(id) {
    let req = supabase.from('billings').select(`
      *,
      patients (first_name, last_name, id, phone_number, email),
      visits (*),
      doctors (first_name, last_name, specialty)
    `);

    // Could be a UUID or a billing_id string
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(id)) {
      req = req.eq('id', id);
    } else {
      req = req.eq('billing_id', id);
    }

    const { data, error } = await req.maybeSingle();
    if (error) throw error;
    if (data) {
      data._id = data.id;
      // Remap nested objects to match mongoose populate shape
      data.patientId = data.patients;
      data.visitId = data.visits;
      data.doctorId = data.doctors;
    }
    return data;
  }

  async findWithDetails(query, page, limit) {
    let req = supabase.from('billings').select(`
      *,
      patients (first_name, last_name, id),
      doctors (first_name, last_name)
    `, { count: 'exact' });

    if (query.clinicId) req = req.eq('clinic_id', query.clinicId);
    if (query.status) req = req.eq('status', query.status);
    if (query.patientId) req = req.eq('patient_id', query.patientId);
    if (query.doctorId) req = req.eq('doctor_id', query.doctorId);
    if (query.visitId) req = req.eq('visit_id', query.visitId);
    if (query.startDate) req = req.gte('created_at', query.startDate);
    if (query.endDate) req = req.lte('created_at', query.endDate);

    req = req
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    const { data, error, count } = await req;
    if (error) throw error;
    return { data: data || [], count: count || 0 };
  }
}

export default new BillingRepository();
