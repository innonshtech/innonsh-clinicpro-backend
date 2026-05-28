import mongoose from "mongoose";
import crypto from "crypto";

const appointmentSchema = new mongoose.Schema({
  appointmentId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: () => `APP-${crypto.randomUUID().split('-')[0].toUpperCase()}`,
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
    index: true
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true,
    index: true
  },
  clinicId: {
    type: String,
    alias: 'tenant_id',
    required: true,
    index: true
  },
  appointmentDate: {
    type: Date,
    required: true,
  },
  timeSlot: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['booked', 'checked_in', 'in_progress', 'completed', 'cancelled', 'scheduled', 'no_show'],
    default: 'booked',
  },
  type: {
    type: String,
    enum: ['normal', 'follow_up'],
    default: 'normal',
  },
  linked_visit_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Visit',
  },
  reason: {
    type: String,
    required: true,
  },
  notes: {
    type: String,
  },
  cancelReason: {
    type: String,
  },
  queueNumber: {
    type: Number,
    index: true,
  },
  checkInTime: {
    type: Date,
  },
  // Emergency flow tracking
  isEmergency: {
    type: Boolean,
    default: false
  },
  rescheduledFrom: {
    type: String, // String representation of the old slot (e.g., "03:00 PM")
  },
  smsNotified: {
    type: Boolean,
    default: false
  },
  // Keep doctor metadata for faster UI rendering without population if needed
  doctorName: { type: String },
  patientName: { type: String },
}, { timestamps: true });

// Compound Index: Index on date + doctor_id for checking availability
appointmentSchema.index({ appointmentDate: 1, doctorId: 1 });
// Compound Index: For sequential queue numbering per doctor per day
appointmentSchema.index({ clinicId: 1, doctorId: 1, appointmentDate: 1, queueNumber: 1 });
// Unique Compound Index: Prevent double booking at the database level
appointmentSchema.index(
  { doctorId: 1, appointmentDate: 1, timeSlot: 1 },
  { 
    unique: true, 
    partialFilterExpression: { 
      status: { $in: ['booked', 'scheduled', 'checked_in', 'in_progress'] } 
    } 
  }
);

// Ensure any existing model is replaced to apply new schema
export default mongoose.models.Appointment || mongoose.model("Appointment", appointmentSchema);
