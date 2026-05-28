import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema({
  userId: {
    type: String, // Store the ID of the user (Staff/Doctor/Admin)
    required: true,
    index: true,
  },
  userRole: {
    type: String,
    required: true,
  },
  userName: {
    type: String, // Helpful for quick display without joins
  },
  action: {
    type: String,
    required: true,
    index: true,
  },
  resourceType: {
    type: String, // 'Patient', 'Billing', 'Appointment', 'Visit'
    required: true,
    index: true,
  },
  resourceId: {
    type: String,
    required: true,
    index: true,
  },
  clinicId: {
    type: String,
    required: true,
    index: true,
  },
  changes: {
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed, // Any extra info like IP, browser, etc.
  }
}, { timestamps: { createdAt: true, updatedAt: false } });

export default mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);
