import mongoose from "mongoose";

const visitSchema = new mongoose.Schema({
  clinicId: {
    type: String,
    alias: 'tenant_id',
    index: true,
    required: true
  },
  appointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment',
    required: true,
    unique: true,
    index: true
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true,
    index: true
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
    index: true
  },
  startTime: {
    type: Date,
    default: Date.now,
  },
  endTime: {
    type: Date,
  },
  status: {
    type: String,
    enum: ['in_progress', 'completed'],
    default: 'in_progress',
  },
  diagnosis: {
    type: String,
  },
  medicines: [{
    name: String,
    dosage: String,
    duration: String,
    instructions: String
  }],
  notes: {
    type: String,
  },
  followUpDate: {
    type: Date,
  },
  followUpNotes: {
    type: String,
  },
  followUpRequired: {
    type: Boolean,
    default: false
  },
  prescriptionUrl: {
    type: String,
  },
  version: {
    type: Number,
    default: 1
  }
}, { timestamps: true });

// Ensure any existing model is replaced to apply new schema
export default mongoose.models.Visit || mongoose.model("Visit", visitSchema);
