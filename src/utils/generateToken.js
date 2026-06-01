import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('[AUTH ERROR] JWT_SECRET is not defined in environment variables.');
}

/**
 * Generates JWT tokens for a user.
 * @param {Object} user - The user object from database.
 * @param {string} role - The user's role.
 * @param {string} [clinicId] - The clinic ID associated with the user.
 * @returns {Object} An object containing accessToken and refreshToken.
 */
export const generateToken = (user, role, clinicId = null) => {
  // If clinicId is not provided, try to get it from the user object
  const effectiveClinicId = clinicId || user.clinicId || (role === 'clinic' ? user._id : null);

  const payload = {
    id: user._id,
    email: user.email,
    role: role || user.role,
    clinicId: effectiveClinicId,
  };

  const accessToken = jwt.sign(
    payload,
    JWT_SECRET,
    { expiresIn: '15m' } // Short-lived access token
  );

  const refreshToken = jwt.sign(
    payload,
    JWT_REFRESH_SECRET,
    { expiresIn: '7d' } // Long-lived refresh token
  );

  return { accessToken, refreshToken };
};
