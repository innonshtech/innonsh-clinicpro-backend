import { supabase } from '@/lib/supabase';
import AppError from '@/utils/AppError';

/**
 * Service to fetch the live queue for a specific doctor.
 * Filters by today's date and statuses 'checked_in' or 'in_progress'.
 */
export const getDoctorQueue = async (doctorId, user) => {
  if (!doctorId) throw new AppError('Doctor ID is required', 400, 'INVALID_ID');

  // Define "Today" time bounds
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const dateStr = today.toISOString().split('T')[0];

  // Fetch all active queue appointments
  const { data: appointments, error } = await supabase
    .from('appointments')
    .select(`
      *,
      patients (id, first_name, last_name, patient_code, phone_number, gender, date_of_birth)
    `)
    .eq('doctor_id', doctorId)
    .eq('clinic_id', user.clinicId)
    .eq('appointment_date', dateStr)
    .in('status', ['checked_in', 'in_progress'])
    .order('is_emergency', { ascending: false })
    .order('check_in_time', { ascending: true, nullsFirst: false });

  if (error) {
    console.error('Supabase queue fetch error:', error);
    throw new AppError('Error fetching doctor queue', 500, 'DB_ERROR');
  }

  // Map Dynamic Tokens
  const mappedQueue = (appointments || []).map((app, index) => ({
    appointmentId: app.id,
    patientName: app.patients ? `${app.patients.first_name} ${app.patients.last_name}` : 'Unknown Patient',
    patientId: app.patients?.patient_code || 'N/A',
    queueNumber: app.queue_number || index + 1,
    timeSlot: app.time_slot,
    status: app.status,
    isEmergency: app.is_emergency
  }));

  const current = mappedQueue.find(app => app.status === 'in_progress') || null;
  const nextList = mappedQueue.filter(app => app.status === 'checked_in');

  return {
    current,
    next: nextList.length > 0 ? nextList[0] : null,
    waitingList: nextList.slice(1)
  };
};
