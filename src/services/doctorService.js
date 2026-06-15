/**
 * doctorService.js - Migrated from Mongoose to Supabase.
 * All slot-generation and availability business logic is preserved.
 */
import { supabase } from '@/lib/supabase';
import AppError from '@/utils/AppError';
import fs from 'fs';
import path from 'path';

const isVercel = !!process.env.VERCEL;
const LOG_FILE = path.join(process.cwd(), 'debug_slots.log');

const logSub = (msg) => {
  if (isVercel) {
    console.log(`[DEBUG] ${msg}`);
  } else {
    const timestamp = new Date().toISOString();
    try {
      fs.appendFileSync(LOG_FILE, `[${timestamp}] ${msg}\n`);
    } catch (e) {
      console.error('Log write failed:', e);
    }
  }
};

/**
 * Helper to generate time slots between two times with a specific interval
 */
const generateTimeSlots = (startTimeStr, endTimeStr, sessionTimeMinutes) => {
  const slots = [];
  const parseTime = (timeStr) => {
    if (!timeStr) return null;
    const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!match) return null;
    let [_, hours, minutes, period] = match;
    hours = parseInt(hours);
    minutes = parseInt(minutes);
    if (period.toUpperCase() === 'PM' && hours !== 12) hours += 12;
    if (period.toUpperCase() === 'AM' && hours === 12) hours = 0;
    const date = new Date(2000, 0, 1);
    date.setHours(hours, minutes, 0, 0);
    return date;
  };

  try {
    let current = parseTime(startTimeStr);
    const end = parseTime(endTimeStr);
    if (!current || !end) return [];
    const interval = parseInt(sessionTimeMinutes) || 30;
    while (current < end) {
      slots.push(current.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }));
      current = new Date(current.getTime() + interval * 60000);
    }
  } catch (error) {
    logSub(`Error: ${error.message}`);
  }
  return slots;
};

/**
 * Service to set or update doctor availability for a specific date.
 */
export const setDoctorAvailability = async (data, user) => {
  const { doctorId, date, available_slots } = data;
  const slots = available_slots || data.availableSlots;
  const { role, clinicId, id: userId } = user;

  if (role.toLowerCase() === 'doctor' && doctorId !== userId) {
    throw new AppError('Access Denied', 403, 'FORBIDDEN');
  }

  const uniqueSlots = [...new Set(slots)];
  if (uniqueSlots.length !== slots.length) {
    throw new AppError('Duplicate slots are not allowed', 400, 'DUPLICATE_ENTRY');
  }

  const normalizedDate = new Date(date);
  normalizedDate.setHours(0, 0, 0, 0);
  const dateStr = normalizedDate.toISOString().split('T')[0];

  const { data: result, error } = await supabase
    .from('availabilities')
    .upsert({
      doctor_id: doctorId,
      date: dateStr,
      clinic_id: clinicId,
      available_slots: slots,
    }, { onConflict: 'doctor_id,date' })
    .select()
    .single();

  if (error) throw error;
  result._id = result.id;
  return result;
};

/**
 * Service to fetch available slots for a doctor on a specific date.
 */
export const getAvailableSlots = async (doctorId, date, clinicId) => {
  const [year, month, day] = date.split('-').map(Number);
  const targetDate = new Date(year, month - 1, day);
  targetDate.setHours(0, 0, 0, 0);
  const dateStr = targetDate.toISOString().split('T')[0];
  const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(targetDate);

  logSub(`Fetching slots for Doctor: ${doctorId}, Date: ${date} (${dayName}), Clinic: ${clinicId}`);

  // 1. Check for Doctor Leave
  const { data: onLeave } = await supabase
    .from('leaves')
    .select('id')
    .eq('doctor_id', doctorId)
    .eq('date', dateStr)
    .maybeSingle();

  if (onLeave) {
    logSub(`Doctor is on leave for ${date}`);
    return { slots: [], onLeave: true };
  }

  // 2. Fetch specific availability override
  const { data: availability } = await supabase
    .from('availabilities')
    .select('available_slots')
    .eq('doctor_id', doctorId)
    .eq('date', dateStr)
    .maybeSingle();

  let availableSlots = [];

  if (availability?.available_slots?.length > 0) {
    logSub(`Found specific availability override. Slots count: ${availability.available_slots.length}`);
    availableSlots = availability.available_slots;
  } else {
    // 3. FALLBACK: Generate from Doctor's default schedule
    const { data: doctor } = await supabase.from('doctors').select('*').eq('id', doctorId).maybeSingle();
    if (!doctor) return { slots: [], onLeave: false };

    let workingDays = doctor.available?.days || doctor.available_days || [];
    let workingTime = doctor.available?.time || doctor.available_time || '9:00 AM to 5:00 PM';

    if (!workingDays || workingDays.length === 0) {
      workingDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    }

    const isWorkingDay = workingDays.some(d => d.toLowerCase() === dayName.toLowerCase());
    if (!isWorkingDay) {
      logSub(`Doctor not scheduled for ${dayName}`);
      return { slots: [], onLeave: false };
    }

    const [start, end] = workingTime.split(' to ');
    if (start && end) {
      availableSlots = generateTimeSlots(start.trim(), end.trim(), doctor.session_time);
    }
  }

  // 4. Fetch already booked appointments
  const { data: bookedAppointments } = await supabase
    .from('appointments')
    .select('time_slot')
    .eq('doctor_id', doctorId)
    .eq('appointment_date', dateStr)
    .in('status', ['booked', 'checked_in', 'in_progress'])
    .eq('clinic_id', clinicId);

  const bookedSlots = (bookedAppointments || []).map(a => a.time_slot);
  logSub(`Booked slots found: ${JSON.stringify(bookedSlots)}`);

  // 5. Map with availability status
  const slotsWithStatus = availableSlots.map(slot => ({
    slot,
    isAvailable: !bookedSlots.includes(slot),
  }));

  return { slots: slotsWithStatus, onLeave: false };
};
