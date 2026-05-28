import { ApiResponse } from '@/utils/apiResponse';
import { withRoles } from '@/utils/authGuard';
import * as reminderService from '@/services/reminderService';

/**
 * POST /api/v1/followup/send-reminders
 * Manually trigger the reminder dispatch engine (useful for testing or daily cron)
 */
export const POST = withRoles(['admin', 'receptionist'], async (req) => {
  try {
    const results = await reminderService.processReminders();
    
    return ApiResponse.success(results, `Reminder process completed: ${results.sent} sent, ${results.failed} failed.`);
  } catch (error) {
    console.error('Error in send-reminders route:', error);
    return ApiResponse.error(`Reminder Engine Failure: ${error.message}`, 'INTERNAL_ERROR', [], 500);
  }
});
