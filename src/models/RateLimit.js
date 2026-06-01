import mongoose from 'mongoose';

const rateLimitSchema = new mongoose.Schema({
  ip: {
    type: String,
    required: true,
    index: true,
  },
  endpoint: {
    type: String,
    required: true,
  },
  hits: {
    type: Number,
    default: 1,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: '1s' } // TTL index to automatically remove expired rate limits
  }
}, { timestamps: true });

// Compound index for quick lookups
rateLimitSchema.index({ ip: 1, endpoint: 1 });

export default mongoose.models.RateLimit || mongoose.model('RateLimit', rateLimitSchema);
