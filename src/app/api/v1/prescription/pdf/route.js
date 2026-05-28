import { ApiResponse } from '@/utils/apiResponse';

export async function POST(req) {
  try {
    const data = await req.json();
    
    // Save mapping to mock localized cache or return immediate response
    // Since backend uses JSON interactions, we can return the payload data identifier
    const uniqueId = Date.now().toString();
    
    return ApiResponse.success({
      downloadUrl: `http://localhost:3001/api/v1/prescription/pdf?id=${uniqueId}`,
      pdfId: uniqueId
    }, 'PDF generation placeholder prepared.');
  } catch (error) {
    return ApiResponse.error('PDF Generation failed', 'SERVER_ERROR', error.message, 500);
  }
}

export async function GET(req) {
  // Return printable responsive template
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Prescription Receipt</title>
      <style>
        body { font-family: sans-serif; padding: 40px; color: #334155; }
        .header { border-bottom: 2px solid #0f766e; padding-bottom: 20px; margin-bottom: 30px; }
        .rx { font-size: 32px; color: #0f766e; font-weight: bold; margin-top: 20px; }
        .footer { margin-top: 50px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 20px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1 style="color: #0f766e; margin: 0;">Prescription Management System</h1>
        <p>Your visit record is summarized below. Hit Ctrl+P to print or save to file.</p>
      </div>
      <div class="rx">℞</div>
      <p>Standard medical protocols established.</p>
      <div class="footer">
        © Doctor ERP Automated Prescription Generator
      </div>
    </body>
    </html>
  `;

  return new Response(htmlContent, {
    headers: { 'Content-Type': 'text/html' }
  });
}
