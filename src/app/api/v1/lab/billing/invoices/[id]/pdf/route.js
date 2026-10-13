import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labBillingService } from '@/services/labBillingService';
import { hasLabPermission, LAB_PERMISSIONS } from '@/constants/labRoles';

/**
 * GET /api/v1/lab/billing/invoices/[id]/pdf
 * Stream and download invoice PDF.
 */
export const GET = withErrorHandler(
  withRoles(['lab', 'admin'], async (req, { params }) => {
    const labId = req.user?.labId || (req.user?.role === 'lab' ? req.user?.id : null);
    if (!labId) {
      return new Response(
        JSON.stringify({ success: false, message: 'Unauthorized: Laboratory identifier missing' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!hasLabPermission(req.user, LAB_PERMISSIONS.VIEW_BILLING)) {
      return new Response(
        JSON.stringify({ success: false, message: 'Access Denied: You do not have permission to download invoices.' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { id } = await params;
    if (!id) {
      return new Response(
        JSON.stringify({ success: false, message: 'Invoice ID parameter is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { filename, pdfBuffer } = await labBillingService.generateInvoicePdfBuffer(labId, id);

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename || `invoice-${id}.pdf`}"`,
        'Content-Length': String(pdfBuffer.length),
        'Cache-Control': 'no-store'
      }
    });
  })
);
