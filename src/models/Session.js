import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true,
  },
  userRole: {
    type: String,
    required: true,
  },
  refreshToken: {
    type: String,
    required: true,
    unique: true,
  },
  usedRefreshTokens: [{
    type: String,
  }],
  ipAddress: {
    type: String,
  },
  device: {
    type: String,
  },
  browser: {
    type: String,
  },
  os: {
    type: String,
  },
  lastActivityAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: '1s' } // TTL index to automatically remove expired sessions
  },
  isActive: {
    type: Boolean,
    default: true,
  }
}, { timestamps: true });

export default mongoose.models.Session || mongoose.model('Session', sessionSchema);
