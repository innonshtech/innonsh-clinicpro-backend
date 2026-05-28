import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { backupService } from '@/services/backupService';
import { ApiResponse } from '@/utils/apiResponse';

/**
 * GET: List all backups
 */
export const GET = withErrorHandler(
  withRoles(['admin'], async () => {
    const backups = await backupService.listBackups();
    return ApiResponse.success(backups, "Backups retrieved successfully");
  })
);

/**
 * POST: Create a new backup
 */
export const POST = withErrorHandler(
  withRoles(['admin'], async () => {
    const result = await backupService.createBackup();
    return ApiResponse.success(result, "Backup created successfully");
  })
);
