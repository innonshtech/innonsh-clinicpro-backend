import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('[AUTH ERROR] JWT_SECRET is not defined in environment variables.');
}

/**
 * Generates a JWT token for a user.
 * @param {Object} user - The user object from database.
 * @param {string} role - The user's role.
 * @param {string} [clinicId] - The clinic ID associated with the user.
 * @returns {string} The signed JWT token.
 */
export const generateToken = (user, role, clinicId = null) => {
  // If clinicId is not provided, try to get it from the user object
  const effectiveClinicId = clinicId || user.clinicId || (role === 'clinic' ? user._id : null);

  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: role || user.role,
      clinicId: effectiveClinicId,
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
};
