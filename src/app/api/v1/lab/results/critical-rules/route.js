import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labResultService } from '@/services/labResultService';
import { isTechnician } from '@/constants/labRoles';

/**
 * GET & POST /api/v1/lab/results/critical-rules
 * Get and configure critical threshold rules
 */
export const GET = withErrorHandler(
  withRoles(['lab', 'admin'], async (req) => {
    const labId = req.user?.labId || (req.user?.role === 'lab' ? req.user?.id : null);
    if (!labId) {
      return ApiResponse.error('Unauthorized: Laboratory identifier missing', 'UNAUTHORIZED', [], 401);
    }

    const rules = await labResultService.getCriticalRules(labId);
    return ApiResponse.success({ rules }, 'Critical threshold rules retrieved');
  })
);

export const POST = withErrorHandler(
  withRoles(['lab', 'admin'], async (req) => {
    const labId = req.user?.labId || (req.user?.role === 'lab' ? req.user?.id : null);
    if (!labId) {
      return ApiResponse.error('Unauthorized: Laboratory identifier missing', 'UNAUTHORIZED', [], 401);
    }

    if (isTechnician(req.user)) {
      return ApiResponse.error('Access Denied: Laboratory technicians cannot configure critical threshold rules.', 'FORBIDDEN', [], 403);
    }

    let body;
    try {
      body = await req.json();
    } catch (e) {
      return ApiResponse.error('Invalid JSON body', 'BAD_REQUEST', [], 400);
    }

    try {
      const rule = await labResultService.saveCriticalRule(labId, body, req.user);
      return ApiResponse.success({ rule }, 'Critical rule saved successfully', 201);
    } catch (err) {
      return ApiResponse.error(err.message, 'RULE_SAVE_FAILED', [], 400);
    }
  })
);
