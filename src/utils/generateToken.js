/**
 * generateToken.js - JWT token generation.
 * This file is UNCHANGED. The existing JWT strategy is preserved:
 * - The middleware verifies JWTs using `jose`.
 * - We keep our own JWT for the backend API so no frontend changes are needed.
 *
 * The only change: we removed the hard crash when JWT_SECRET is missing at module-load
 * time so the app can start without credentials during development.
 */
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || JWT_SECRET;

/**
 * Generates JWT tokens for a user.
 * @param {Object} user - The user object from database.
 * @param {string} role - The user's role.
 * @param {string} [clinicId] - The clinic ID associated with the user.
 * @returns {Object} An object containing accessToken and refreshToken.
 */
export const generateToken = (user, role, clinicId = null) => {
  const secret = JWT_SECRET;
  if (!secret) {
    throw new Error('[AUTH ERROR] JWT_SECRET is not defined in environment variables.');
  }
  const refreshSecret = JWT_REFRESH_SECRET || secret;

  // If clinicId is not provided, try to get it from the user object
  const effectiveClinicId = clinicId || user.clinicId || (role === 'clinic' ? (user.id || user._id) : null);

  const payload = {
    id: user.id || user._id,
    email: user.email,
    role: role || user.role,
    clinicId: effectiveClinicId,
  };

  const accessToken = jwt.sign(payload, secret, { expiresIn: '15m' });
  const refreshToken = jwt.sign(payload, refreshSecret, { expiresIn: '7d' });

  return { accessToken, refreshToken };
};
