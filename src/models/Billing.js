import mongoose from "mongoose";
import crypto from "crypto";

/**
 * Item structure for the billing invoice
 */
const billingItemSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['consultation', 'lab', 'medicine', 'other'],
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  }
}, { _id: false });

/**
 * Billing & Invoice Schema
 */
const billingSchema = new mongoose.Schema({
  billingId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: () => `BILL-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
    index: true,
  },
  visitId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Visit',
    required: true,
    index: true,
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor', // Refers to the doctor
    required: true,
    index: true,
  },
  clinicId: {
    type: String,
    alias: 'tenant_id',
    required: true,
    index: true,
  },
  items: [billingItemSchema],
  totalAmount: {
    type: Number,
    required: true,
    default: 0,
  },
  discount: {
    type: Number,
    required: true,
    default: 0,
  },
  tax: {
    type: Number,
    required: true,
    default: 0,
  },
  finalAmount: {
    type: Number,
    required: true,
    default: 0,
  },
  status: {
    type: String,
    enum: ['pending', 'partially_paid', 'paid', 'cancelled', 'refunded'],
    default: 'pending',
    index: true,
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'upi', 'online', 'other'],
  },
  transactionId: {
    type: String,
  },
  paidAt: {
    type: Date,
  },
  paidAmount: {
    type: Number,
    default: 0,
  },
  remainingAmount: {
    type: Number,
    default: function() { return this.finalAmount || 0; },
  },
  refundAmount: {
    type: Number,
    default: 0,
  },
  refundReason: {
    type: String,
  },
  refundedAt: {
    type: Date,
  }
}, { timestamps: true });

export default mongoose.models.Billing || mongoose.model("Billing", billingSchema);
