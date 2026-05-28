import mongoose from "mongoose";
import crypto from "crypto";
import { ROLES, ROLE_LIST } from "../constants/roles";

const patientSchema = new mongoose.Schema(
  {
    patientId: {
      type: String,
      default: () => crypto.randomUUID(),
      unique: true,
      index: true,
    },
    patientCode: {
      type: String,
      unique: true,
      index: true,
    },
    firstName: {
      type: String,
      required: true,
    },
    lastName: {
      type: String,
      required: true,
    },
    dateOfBirth: {
      type: String,
      required: true,
    },
    gender: {
      type: String,
      required: true,
    },
    phoneNumber: {
      type: String,
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    address: {
      type: String,
    },
    city: {
      type: String,
    },
    state: {
      type: String,
    },
    zipCode: {
      type: String,
    },
    bloodGroup: {
      type: String,
    },
    emergencyContact: {
      type: String,
    },
    medicalHistory: {
      type: String,
    },
    allergies: {
      type: String,
    },
    currentMedications: {
      type: String,
    },
    symptoms: {
      type: String,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ROLE_LIST,
      default: ROLES.PATIENT,
    },
    clinicId: {
      type: String,
      alias: 'tenant_id',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Performance Optimizations: Compound Indexes for Clinic-Scoped Searching
// 1. Search by Name
patientSchema.index({ clinicId: 1, firstName: 1, lastName: 1 });
// 2. Search by Phone Number
patientSchema.index({ clinicId: 1, phoneNumber: 1 });
// 3. Search by Patient UUID
patientSchema.index({ clinicId: 1, patientId: 1 });
// 4. Text index for broad search (optional but powerful)
patientSchema.index({ firstName: 'text', lastName: 'text', phoneNumber: 'text', patientId: 'text' });

// Add any extra schema-level indexes here if needed

export default mongoose.models.Patient || mongoose.model("Patient", patientSchema);
