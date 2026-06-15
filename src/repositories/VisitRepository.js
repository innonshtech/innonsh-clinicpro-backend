import BaseRepository from './BaseRepository';
import { supabase } from '@/lib/supabase';

class VisitRepository extends BaseRepository {
  constructor() {
    super('visits');
  }

  /**
   * Find a visit by appointment_id (UUID)
   */
  async findByAppointmentId(appointmentId) {
    const { data, error } = await supabase
      .from('visits')
      .select('*')
      .eq('appointment_id', appointmentId)
      .maybeSingle();
    if (error) throw error;
    if (data) data._id = data.id;
    return data;
  }

  /**
   * Find a visit by its id with optional populates
   */
  async findByIdWithDetails(id) {
    const { data, error } = await supabase
      .from('visits')
      .select(`
        *,
        doctors (first_name, last_name, specialty, phone),
        appointments (appointment_date, time_slot, reason)
      `)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (data) data._id = data.id;
    return data;
  }
}

export default new VisitRepository();
