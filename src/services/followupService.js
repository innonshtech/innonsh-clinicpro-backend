import AppError from '@/utils/AppError';
import { supabase } from '@/lib/supabase';

/**
 * Service to fetch follow-up appointments for reception.
 */
export const getFollowupList = async (filters, user) => {
  const { page = 1, limit = 10, date, doctorId } = filters;
  
  if (!user.clinicId) {
    throw new AppError('Clinic ID missing from user context', 401, 'UNAUTHORIZED');
  }

  let supabaseQuery = supabase
    .from('appointments')
    .select(`
      *,
      patients (id, first_name, last_name, patient_code, phone),
      doctors (id, first_name, last_name, specialty)
    `, { count: 'exact' })
    .eq('clinic_id', user.clinicId)
    .eq('type', 'follow_up')
    .in('status', ['scheduled', 'booked']);

  if (date) {
    const searchDate = new Date(date);
    searchDate.setUTCHours(0, 0, 0, 0);
    const dateStr = searchDate.toISOString().split('T')[0];
    supabaseQuery = supabaseQuery.eq('appointment_date', dateStr);
  } else {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const dateStr = today.toISOString().split('T')[0];
    supabaseQuery = supabaseQuery.gte('appointment_date', dateStr);
  }

  if (doctorId) {
    supabaseQuery = supabaseQuery.eq('doctor_id', doctorId);
  }

  const skip = (page - 1) * limit;
  
  const { data: appointmentsData, count, error } = await supabaseQuery
    .order('appointment_date', { ascending: true })
    .range(skip, skip + limit - 1);

  if (error) {
    console.error('Supabase follow-up fetch error:', error);
    throw new AppError('Error fetching follow-ups from Supabase', 500, 'DB_ERROR');
  }

  const appointments = (appointmentsData || []).map(a => ({
    ...a,
    _id: a.id,
    patientId: a.patients ? {
      _id: a.patients.id,
      firstName: a.patients.first_name,
      lastName: a.patients.last_name,
      patientId: a.patients.patient_code,
      phoneNumber: a.patients.phone
    } : null,
    doctorId: a.doctors ? {
      _id: a.doctors.id,
      firstName: a.doctors.first_name,
      lastName: a.doctors.last_name,
      specialty: a.doctors.specialty
    } : null
  }));

  return {
    appointments,
    total: count || 0,
    page: Number(page),
    limit: Number(limit),
    totalPages: Math.ceil((count || 0) / limit)
  };
};
