import mongoose from "mongoose";

const leaveSchema = new mongoose.Schema({
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true,
    index: true,
  },
  clinicId: {
    type: String,
    required: true,
    index: true,
  },
  date: {
    type: Date,
    required: true,
  },
  reason: {
    type: String,
    default: "Not specified",
  }
}, { timestamps: true });

// Ensure a doctor can't have duplicate leave entries for the same day
leaveSchema.index({ doctorId: 1, date: 1 }, { unique: true });

export default mongoose.models.Leave || mongoose.model("Leave", leaveSchema);
