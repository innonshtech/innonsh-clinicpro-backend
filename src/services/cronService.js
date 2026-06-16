import { supabase } from '@/lib/supabase';

/**
 * Automatically mark appointments as 'no_show' if they are past their scheduled time.
 * @param {number} thresholdMinutes - Minutes to wait after the timeSlot before marking as no_show.
 * @returns {number} Number of appointments updated.
 */
export const processNoShows = async (thresholdMinutes = 30) => {
  const now = new Date();
  
  // We only check pending appointments
  const { data: pendingAppointments, error: fetchError } = await supabase
    .from('appointments')
    .select('id, appointment_date, time_slot, notes')
    .in('status', ['booked', 'scheduled']);

  if (fetchError) {
    console.error('Supabase fetch error in no-show cron:', fetchError);
    return 0;
  }

  let markedCount = 0;

  for (const app of (pendingAppointments || [])) {
    if (!app.appointment_date || !app.time_slot) continue;

    // Parse timeSlot '10:00 AM'
    const timeMatch = app.time_slot.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!timeMatch) continue;

    let hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    const modifier = timeMatch[3].toUpperCase();

    if (modifier === 'PM' && hours < 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;

    // Build the expected actual date-time of the appointment
    const appointmentTime = new Date(app.appointment_date);
    appointmentTime.setHours(hours, minutes, 0, 0);
    
    // Add threshold minutes
    const thresholdTime = new Date(appointmentTime.getTime() + thresholdMinutes * 60000);

    if (now > thresholdTime) {
      const newNotes = app.notes ? `${app.notes}\n[SYSTEM] Auto-marked as No-show.` : '[SYSTEM] Auto-marked as No-show.';
      
      const { error: updateError } = await supabase
        .from('appointments')
        .update({ status: 'no_show', notes: newNotes })
        .eq('id', app.id);
        
      if (!updateError) {
        markedCount++;
      }
    }
  }

  console.log(`[NO-SHOW CRON] Scanned ${(pendingAppointments || []).length} pending appointments. Marked ${markedCount} as no_show.`);
  return markedCount;
};
