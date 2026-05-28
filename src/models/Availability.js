import mongoose from "mongoose";

const availabilitySchema = new mongoose.Schema({
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true,
  },
  clinicId: {
    type: String,
    required: true,
  },
  date: {
    type: Date, // Specific date
    required: true,
  },
  availableSlots: [{
    type: String, // e.g., "10:00 AM", "10:30 AM"
    required: true,
  }]
}, { timestamps: true });

// Ensure uniqueness per doctor and date
availabilitySchema.index({ doctorId: 1, date: 1 }, { unique: true });
// Add index on date for faster lookups when searching for available doctors
availabilitySchema.index({ date: 1 });

export default mongoose.models.Availability || mongoose.model("Availability", availabilitySchema);
