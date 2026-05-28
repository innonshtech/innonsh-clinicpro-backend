import { ApiResponse } from './apiResponse';

/**
 * Multi-Tenant Middleware
 * Ensures that the current user is operating within their designated tenant (Clinic).
 * Injects `tenant_id` into the request object for downstream controllers to use for data isolation.
 */
export function withTenant(handler) {
  return async (req, context) => {
    try {
      // Ensure authGuard has run and injected req.user
      if (!req.user) {
        return ApiResponse.error(
          'Unauthorized: User session not found. Make sure authGuard runs first.',
          'UNAUTHORIZED',
          [],
          401
        );
      }

      // Determine the tenant ID based on user role
      // For clinic admins, their own ID is the tenant ID. For staff/doctors, it's their clinicId.
      let tenant_id = null;
      if (req.user.role === 'clinic') {
        tenant_id = req.user.id || req.user._id;
      } else if (req.user.clinicId) {
        tenant_id = req.user.clinicId;
      }

      if (!tenant_id) {
        return ApiResponse.error(
          'Cross-Clinic Access Blocked: You are not assigned to any valid clinic (tenant).',
          'MISSING_TENANT_ID',
          [],
          403
        );
      }

      // Inject the tenant_id into the request object for strict data isolation
      req.tenant_id = tenant_id;

    } catch (error) {
      console.error('Tenant Middleware Error:', error);
      return ApiResponse.error(
        'Internal Server Error in Tenant Middleware',
        'TENANT_ERROR',
        error.message,
        500
      );
    }

    // Proceed to the controller
    return await handler(req, context);
  };
}
