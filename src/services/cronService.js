import Appointment from '@/models/Appointments';
import dbConnect from '@/utils/db';

/**
 * Automatically mark appointments as 'no_show' if they are past their scheduled time.
 * @param {number} thresholdMinutes - Minutes to wait after the timeSlot before marking as no_show.
 * @returns {number} Number of appointments updated.
 */
export const processNoShows = async (thresholdMinutes = 30) => {
  await dbConnect();

  const now = new Date();
  
  // We only check appointments for today or earlier
  // Since appointmentDate is stored as midnight UTC, we'll just check all pending
  const pendingAppointments = await Appointment.find({
    status: { $in: ['booked', 'scheduled'] },
  });

  let markedCount = 0;

  for (const app of pendingAppointments) {
    if (!app.appointmentDate || !app.timeSlot) continue;

    // Parse timeSlot '10:00 AM'
    const timeMatch = app.timeSlot.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!timeMatch) continue;

    let hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    const modifier = timeMatch[3].toUpperCase();

    if (modifier === 'PM' && hours < 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;

    // Build the expected actual date-time of the appointment
    const appointmentTime = new Date(app.appointmentDate);
    // Assuming server local time is the clinic's local time
    appointmentTime.setHours(hours, minutes, 0, 0);
    
    // Add threshold minutes
    const thresholdTime = new Date(appointmentTime.getTime() + thresholdMinutes * 60000);

    if (now > thresholdTime) {
      app.status = 'no_show';
      app.notes = app.notes ? `${app.notes}\n[SYSTEM] Auto-marked as No-show.` : '[SYSTEM] Auto-marked as No-show.';
      await app.save();
      markedCount++;
    }
  }

  console.log(`[NO-SHOW CRON] Scanned ${pendingAppointments.length} pending appointments. Marked ${markedCount} as no_show.`);
  return markedCount;
};
