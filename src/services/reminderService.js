import Appointment from '@/models/Appointments';
import Patient from '@/models/Patient';
import dbConnect from '@/utils/db';
import { sendSMS } from '@/utils/smsService';

/**
 * Service to process and send follow-up reminders.
 */
export const processReminders = async () => {
  await dbConnect();
  
  // 1. Define time window (Today and Tomorrow)
  const now = new Date();
  const startOfToday = new Date(now.setHours(0, 0, 0, 0));
  const endOfTomorrow = new Date(new Date(startOfToday).getTime() + 2 * 24 * 60 * 60 * 1000 - 1);

  // 2. Find pending follow-ups in this window
  const pendingFollowups = await Appointment.find({
    type: 'follow_up',
    status: { $in: ['scheduled', 'booked'] },
    smsNotified: { $ne: true },
    appointmentDate: { $gte: startOfToday, $lte: endOfTomorrow }
  }).populate('patientId', 'firstName phoneNumber');

  console.log(`[REMINDER ENGINE] Found ${pendingFollowups.length} pending reminders to send.`);

  const results = {
    sent: 0,
    failed: 0,
    logs: []
  };

  // 3. Dispatch SMS for each
  for (const appt of pendingFollowups) {
    try {
      const patientName = appt.patientId?.firstName || 'Patient';
      const phone = appt.patientId?.phoneNumber;
      const isToday = new Date(appt.appointmentDate).toDateString() === new Date().toDateString();
      const whenStr = isToday ? 'today' : 'tomorrow';
      
      const message = `Hello ${patientName},\nReminder: Your follow-up visit is ${whenStr} at ${appt.timeSlot}. Looking forward to seeing you.`;

      if (phone) {
        const smsResult = await sendSMS(phone, message);
        if (smsResult.success) {
          appt.smsNotified = true;
          await appt.save();
          results.sent++;
          results.logs.push(`Successfully sent to ${patientName} (${phone})`);
        } else {
          results.failed++;
          results.logs.push(`Failed for ${patientName}: ${smsResult.error}`);
        }
      } else {
        results.failed++;
        results.logs.push(`Missing phone number for ${patientName}`);
      }
    } catch (err) {
      results.failed++;
      results.logs.push(`System Error processing appointment ${appt._id}: ${err.message}`);
    }
  }

  return results;
};
