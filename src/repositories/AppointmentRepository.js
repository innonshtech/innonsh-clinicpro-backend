import BaseRepository from './BaseRepository';
import { supabase } from '@/lib/supabase';

class AppointmentRepository extends BaseRepository {
  constructor() {
    super('appointments');
  }

  /**
   * Find an appointment by UUID id or string appointmentId
   */
  async findByAnyId(id) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let req = supabase.from('appointments').select('*');
    if (uuidRegex.test(id)) {
      req = req.eq('id', id);
    } else {
      // could be APP-XXXXXX format
      req = req.or(`id.eq.${id}`); // fallback
    }
    const { data, error } = await req.maybeSingle();
    if (error) throw error;
    if (data) data._id = data.id;
    return data;
  }

  /**
   * Find appointments with joined doctor and patient info
   */
  async findWithPopulate(query, { page, limit, sort } = {}) {
    let req = supabase.from('appointments').select(`
      *,
      patients (first_name, last_name, phone_number, id),
      doctors (first_name, last_name, specialty)
    `, { count: 'exact' });

    if (query.clinicId) req = req.eq('clinic_id', query.clinicId);
    if (query.doctorId) req = req.eq('doctor_id', query.doctorId);
    if (query.patientId) req = req.eq('patient_id', query.patientId);
    if (query.status) req = req.eq('status', query.status);
    if (query['status.$ne']) req = req.neq('status', query['status.$ne']);
    if (query.startDate) req = req.gte('appointment_date', query.startDate);
    if (query.endDate) req = req.lte('appointment_date', query.endDate);

    if (sort === 'queue') {
      req = req.order('queue_number', { ascending: true }).order('time_slot', { ascending: true });
    } else {
      req = req.order('appointment_date', { ascending: true }).order('time_slot', { ascending: true });
    }

    if (page && limit) {
      req = req.range((page - 1) * limit, page * limit - 1);
    }

    const { data, error, count } = await req;
    if (error) throw error;
    
    // Remap nested joins to match mongoose .populate() shape
    const appointments = (data || []).map(a => ({
      ...a,
      _id: a.id,
      patientId: a.patients ? { _id: a.patients.id, ...a.patients } : a.patient_id,
      doctorId: a.doctors ? { _id: a.doctors.id, ...a.doctors } : a.doctor_id,
    }));

    return { data: appointments, count: count || 0 };
  }

  /**
   * Update many appointments matching a filter
   */
  async updateMany(filter, update) {
    let req = supabase.from('appointments').update(update);
    if (filter.clinicId) req = req.eq('clinic_id', filter.clinicId);
    if (filter.doctorId) req = req.eq('doctor_id', filter.doctorId);
    if (filter.status) req = req.eq('status', filter.status);
    const { error } = await req;
    if (error) throw error;
  }

  /**
   * Count documents matching a query
   */
  async countDocuments(query) {
    let req = supabase.from('appointments').select('id', { count: 'exact', head: true });
    if (query.clinicId) req = req.eq('clinic_id', query.clinicId);
    if (query.doctorId) req = req.eq('doctor_id', query.doctorId);
    if (query.status) req = req.eq('status', query.status);
    const { count, error } = await req;
    if (error) throw error;
    return count || 0;
  }
}

export default new AppointmentRepository();
