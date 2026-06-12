import { ApiResponse } from './apiResponse';
import logger from './logger';

/**
 * Role-Based Access Control (RBAC) Higher-Order Function.
 * Wraps a Next.js App Router handler to securely authorize specific roles.
 * 
 * @param {string[]} allowedRoles Array of roles (e.g. ['admin', 'doctor', 'clinic', 'receptionist', 'patient'])
 * @param {Function} handler The route handler function
 * @returns {Function} Authorized handler
 */
export function withRoles(allowedRoles, handler) {
  return async (req, context) => {
    try {
      // Middleware has already verified the token and injected headers.
      const userId = req.headers.get('x-user-id');
      const userRole = req.headers.get('x-user-role');
      const clinicId = req.headers.get('x-user-clinic-id');

      if (!userId || !userRole) {
        // If the headers are missing, either it's a public route or something went wrong.
        // If this route is protected, middleware should have blocked it.
        // We will fallback to 401 just in case.
        return ApiResponse.error(
          'Missing or invalid authorization context from middleware',
          'MISSING_CONTEXT',
          [],
          401
        );
      }

      req.user = { id: userId, _id: userId, role: userRole, clinicId: clinicId };

      // Double check RBAC if allowedRoles is provided, though middleware should have handled it globally.
      if (allowedRoles && allowedRoles.length > 0) {
        const userRoleLower = userRole.toLowerCase();
        const normalizedAllowedRoles = allowedRoles.map(r => r.toLowerCase());

        if (!normalizedAllowedRoles.includes(userRoleLower)) {
          logger.warn(`Security Event: Access Denied for User ID ${userId}. Expected ${allowedRoles.join(', ')} but got ${userRole}`);
          return ApiResponse.error(
            `Access Denied. Required roles: ${allowedRoles.join(', ')}`,
            'FORBIDDEN',
            { yourRole: userRole },
            403
          );
        }
      }

    } catch (error) {
      logger.error('RBAC Authorization Error in authGuard:', { message: error.message, stack: error.stack });
      return ApiResponse.error(
        'Internal Server Authorization Error',
        'AUTH_ERROR',
        error.message,
        500
      );
    }

    // Proceed to the original handler with an authorized request
    return await handler(req, context);
  };
}

