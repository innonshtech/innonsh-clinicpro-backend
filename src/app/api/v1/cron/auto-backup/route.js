import { NextResponse } from 'next/server';
import { ApiResponse } from '@/utils/apiResponse';
import { backupService } from '@/services/backupService';

/**
 * @swagger
 * /api/v1/cron/auto-backup:
 *   get:
 *     summary: Trigger an automated, encrypted database backup
 *     tags: [Cron]
 *     responses:
 *       200:
 *         description: Backup successful
 *       401:
 *         description: Unauthorized
 */
export async function GET(req) {
  try {
    // Basic security: Ensure the request provides the CRON_SECRET
    const authHeader = req.headers.get('authorization');
    const expectedSecret = process.env.CRON_SECRET;

    if (!expectedSecret) {
       console.warn('[CRON WARNING] CRON_SECRET is not configured in environment variables.');
    }

    if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
      return ApiResponse.error("Unauthorized cron invocation", "UNAUTHORIZED", [], 401);
    }

    // Trigger the automated backup, which also handles encryption and retention pruning
    const result = await backupService.createBackup();

    return ApiResponse.success({
      filename: result.filename,
      message: result.message
    }, "Automated backup completed successfully.");

  } catch (error) {
    console.error('[CRON BACKUP ERROR]', error);
    return ApiResponse.error("Automated backup failed", "BACKUP_FAILED", error.message, 500);
  }
}
