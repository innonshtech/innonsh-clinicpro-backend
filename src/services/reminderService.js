import { supabase } from '@/lib/supabase';
import { sendSMS } from '@/utils/smsService';

/**
 * Service to process and send follow-up reminders.
 */
export const processReminders = async () => {
  // 1. Define time window (Today and Tomorrow)
  const now = new Date();
  const startOfToday = new Date(now.setHours(0, 0, 0, 0));
  const endOfTomorrow = new Date(new Date(startOfToday).getTime() + 2 * 24 * 60 * 60 * 1000 - 1);
  
  const startDateStr = startOfToday.toISOString().split('T')[0];
  const endDateStr = endOfTomorrow.toISOString().split('T')[0];

  // 2. Find pending follow-ups in this window
  const { data: pendingFollowups, error } = await supabase
    .from('appointments')
    .select(`
      id,
      appointment_date,
      time_slot,
      patients (first_name, phone)
    `)
    .eq('type', 'follow_up')
    .in('status', ['scheduled', 'booked'])
    .neq('sms_notified', true)
    .gte('appointment_date', startDateStr)
    .lte('appointment_date', endDateStr);

  if (error) {
    console.error('Supabase fetch error in reminder service:', error);
    return { sent: 0, failed: 0, logs: [`Database error: ${error.message}`] };
  }

  console.log(`[REMINDER ENGINE] Found ${(pendingFollowups || []).length} pending reminders to send.`);

  const results = {
    sent: 0,
    failed: 0,
    logs: []
  };

  // 3. Dispatch SMS for each
  for (const appt of (pendingFollowups || [])) {
    try {
      const patientName = appt.patients?.first_name || 'Patient';
      const phone = appt.patients?.phone;
      const isToday = new Date(appt.appointment_date).toDateString() === new Date().toDateString();
      const whenStr = isToday ? 'today' : 'tomorrow';
      
      const message = `Hello ${patientName},\nReminder: Your follow-up visit is ${whenStr} at ${appt.time_slot}. Looking forward to seeing you.`;

      if (phone) {
        const smsResult = await sendSMS(phone, message);
        if (smsResult.success) {
          await supabase
            .from('appointments')
            .update({ sms_notified: true })
            .eq('id', appt.id);
            
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
      results.logs.push(`System Error processing appointment ${appt.id}: ${err.message}`);
    }
  }

  return results;
};
