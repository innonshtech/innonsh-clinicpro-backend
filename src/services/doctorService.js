import Availability from '@/models/Availability';
import Appointment from '@/models/Appointments';
import Doctor from '@/models/Doctor';
import Leave from '@/models/Leave';
import dbConnect from '@/utils/db';
import mongoose from 'mongoose';
import AppError from '@/utils/AppError';

import fs from 'fs';
import path from 'path';

const isVercel = !!process.env.VERCEL;
const LOG_FILE = path.join(process.cwd(), 'debug_slots.log');
const logSub = (msg) => {
  if (isVercel) {
    // In Vercel environments the filesystem is read‑only; fall back to console
    console.log(`[DEBUG] ${msg}`);
  } else {
    const timestamp = new Date().toISOString();
    try {
      fs.appendFileSync(LOG_FILE, `[${timestamp}] ${msg}\n`);
    } catch (e) {
      // If writing fails (e.g., read‑only FS), silently ignore to avoid crashing
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
      const slotTime = current.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      slots.push(slotTime);
      current = new Date(current.getTime() + interval * 60000);
    }
  } catch (error) {
    if (typeof logSub === 'function') logSub(`Error: ${error.message}`);
  }
  
  return slots;
};

/**
 * Service to set or update doctor availability for a specific date.
 */
export const setDoctorAvailability = async (data, user) => {
  await dbConnect();
  
  const { doctorId, date, available_slots } = data;
  const slots = available_slots || data.availableSlots;
  const { role, clinicId, id: userId } = user;
  const userRole = role.toLowerCase();

  if (userRole === 'doctor' && doctorId !== userId) {
    throw new AppError('Access Denied', 403, 'FORBIDDEN');
  }


  const uniqueSlots = [...new Set(slots)];
  if (uniqueSlots.length !== slots.length) {
    throw new AppError('Duplicate slots are not allowed', 400, 'DUPLICATE_ENTRY');
  }


  const filter = {
    doctorId: new mongoose.Types.ObjectId(doctorId),
    date: new Date(date).setHours(0, 0, 0, 0),
  };

  const update = {
    clinicId,
    availableSlots: slots,
  };

  const options = { upsert: true, new: true, setDefaultsOnInsert: true };
  return await Availability.findOneAndUpdate(filter, update, options);
};

/**
 * Service to fetch available slots for a doctor on a specific date.
 */
export const getAvailableSlots = async (doctorId, date, clinicId) => {
  await dbConnect();
  
  // Normalize date to avoid timezone shifts
  const [year, month, day] = date.split('-').map(Number);
  const targetDate = new Date(year, month - 1, day);
  targetDate.setHours(0, 0, 0, 0);
  
  // Use a fixed locale for day name matching
  const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(targetDate);
  
  logSub(`Fetching slots for Doctor: ${doctorId}, Date: ${date} (${dayName}), Clinic: ${clinicId}`);

  // 1. Check for Doctor Leave
  const onLeave = await Leave.findOne({
    doctorId: new mongoose.Types.ObjectId(doctorId),
    date: targetDate,
    clinicId
  });

  if (onLeave) {
    logSub(`Doctor is on leave for ${date}`);
    return { slots: [], onLeave: true }; 
  }

  // 2. Fetch specific availability override
  const availability = await Availability.findOne({
    doctorId: new mongoose.Types.ObjectId(doctorId),
    date: targetDate,
    clinicId
  });

  let availableSlots = [];

  if (availability && availability.availableSlots?.length > 0) {
    logSub(`Found specific availability override. Slots count: ${availability.availableSlots.length}`);
    availableSlots = availability.availableSlots;
  } else {
    // 3. FALLBACK: Generate from Doctor's default schedule
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) return { slots: [], onLeave: false };
    
    let workingDays = doctor.available?.days || doctor.availableDays || [];
    let workingTime = doctor.available?.time || doctor.availableTime || "9:00 AM to 5:00 PM";
    
    if (!workingDays || workingDays.length === 0) {
      logSub(`No working days defined for ${doctor.firstName}, defaulting to Mon-Fri`);
      workingDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    }

    // Check if doctor works on this day
    const isWorkingDay = workingDays.some(day => 
      day.toLowerCase() === dayName.toLowerCase()
    );

    if (!isWorkingDay) {
      logSub(`Doctor ${doctor.firstName} not scheduled for ${dayName}`);
      return { slots: [], onLeave: false };
    }

    const [start, end] = workingTime.split(' to ');
    if (start && end) {
      availableSlots = generateTimeSlots(start.trim(), end.trim(), doctor.sessionTime);
    }
  }

  // 4. Fetch already booked appointments
  const bookedAppointments = await Appointment.find({
    doctorId: new mongoose.Types.ObjectId(doctorId),
    appointmentDate: targetDate,
    status: { $in: ['booked', 'checked_in', 'in_progress'] },
    clinicId
  }).select('timeSlot');

  const bookedSlots = bookedAppointments.map(app => app.timeSlot);
  logSub(`Booked slots found: ${JSON.stringify(bookedSlots)}`);

  // 5. Map with availability status
  const slotsWithStatus = availableSlots.map(slot => ({
    slot,
    isAvailable: !bookedSlots.includes(slot)
  }));

  return { slots: slotsWithStatus, onLeave: false };
};
