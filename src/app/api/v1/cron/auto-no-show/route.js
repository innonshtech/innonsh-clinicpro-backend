import { NextResponse } from 'next/server';
import { processNoShows } from '@/services/cronService';

// POST: /api/v1/cron/auto-no-show
/**
 * @swagger
 * /api/v1/cron/auto-no-show:
 *   post:
 *     summary: Auto-mark No-Shows
 *     description: Scans all booked/scheduled appointments and marks them as no_show if they are past the threshold.
 *     tags: [Cron]
 *     parameters:
 *       - in: query
 *         name: threshold
 *         schema:
 *           type: integer
 *         description: Minutes to wait after the timeSlot before marking as no_show (default is 30).
 *     responses:
 *       200:
 *         description: Success
 */
export async function POST(req) {
  try {
    const url = new URL(req.url);
    const thresholdParam = url.searchParams.get('threshold');
    const thresholdMinutes = thresholdParam ? parseInt(thresholdParam, 10) : 30;

    const markedCount = await processNoShows(thresholdMinutes);

    return NextResponse.json(
      {
        success: true,
        message: `Successfully processed no-shows. Marked ${markedCount} appointments.`,
        data: { markedCount }
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error in auto-no-show cron route:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error', error: error.message },
      { status: 500 }
    );
  }
}

// OPTIONS for CORS
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
  });
}
