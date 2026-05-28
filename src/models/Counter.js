import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // 'patient_code', 'invoice_number'
  seq: { type: Number, default: 0 }
});

export default mongoose.models.Counter || mongoose.model('Counter', counterSchema);
