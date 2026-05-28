import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { backupService } from '@/services/backupService';
import { ApiResponse } from '@/utils/apiResponse';

/**
 * POST: Restore from a specific backup
 */
export const POST = withErrorHandler(
  withRoles(['admin'], async (req) => {
    const { filename } = await req.json();
    
    if (!filename) {
      return ApiResponse.error("Filename is required", "VALIDATION_ERROR", [], 400);
    }

    const result = await backupService.restoreBackup(filename);
    return ApiResponse.success(result, "Database restored successfully");
  })
);
