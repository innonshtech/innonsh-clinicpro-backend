import dbConnect from '../src/utils/db.js';
import Doctor from '../src/models/Doctor.js';
import Availability from '../src/models/Availability.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config({ path: '.env' });

async function seed() {
  await dbConnect();

  const clinicId = "69d60484767b1f86a9d9d988";
  const doctorEmail = "test.doctor@example.com";

  // 1. Create Doctor if NOT exists
  let doctor = await Doctor.findOne({ email: doctorEmail });
  if (!doctor) {
    const hashedPassword = await bcrypt.hash("password123", 12);
    doctor = await Doctor.create({
      firstName: "Test",
      lastName: "Doctor",
      email: doctorEmail,
      password: hashedPassword,
      phone: "1234567890",
      specialty: "General Physician",
      experience: 10,
      hospital: "City Hospital",
      clinicId: clinicId,
      profileImage: "https://via.placeholder.com/150",
      dateOfBirth: "1980-01-01",
      gender: "male",
      isVerified: true,
      status: "active",
      available: {
        days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        time: "09:00 AM - 05:00 PM"
      }
    });
    console.log('Test Doctor created:', doctor._id);
  } else {
    console.log('Test Doctor already exists:', doctor._id);
  }

  // 2. Create Availability for TODAY (using local date string to match expected format)
  const todayStr = new Date().toISOString().split('T')[0];
  const targetDate = new Date(todayStr + 'T00:00:00Z');

  const slots = [
    "09:00 AM", "09:30 AM", "10:00 AM", "10:30 AM",
    "11:00 AM", "11:30 AM", "02:00 PM", "02:30 PM",
    "03:00 PM", "03:30 PM", "04:00 PM", "04:30 PM"
  ];

  await Availability.findOneAndUpdate(
    { 
      doctorId: doctor._id, 
      date: targetDate 
    },
    { 
      clinicId: clinicId,
      availableSlots: slots 
    },
    { upsert: true, new: true }
  );

  console.log('Availability seeded for today:', targetDate.toISOString().split('T')[0]);
  process.exit(0);
}

seed().catch(err => {
    console.error(err);
    process.exit(1);
});
