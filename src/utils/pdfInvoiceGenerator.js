/**
 * Standard PDF 1.4 Vector Document Generator for Laboratory Tax Invoices
 * Self-contained without external dependencies.
 */

function escapePdfText(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

export function generateInvoicePdf(invoiceData) {
  const {
    invoice_number = 'INV-000000',
    issued_at = new Date().toISOString(),
    due_date = null,
    status = 'issued',
    lab = {},
    patient_name = 'Patient',
    patient_code = 'N/A',
    patient_phone = 'N/A',
    patient_gender = 'N/A',
    order_number = 'N/A',
    clinic_name = 'Outpatient Clinic',
    doctor_name = null,
    items = [],
    subtotal = 0,
    discount = 0,
    tax = 0,
    total_amount = 0,
    paid_amount = 0,
    balance_amount = 0,
    payments = [],
    notes = ''
  } = invoiceData;

  const labName = lab.lab_name || lab.name || 'ClinicPro Laboratory Services';
  const labEmail = lab.email || '';
  const labPhone = lab.phone || '';
  const labAddress = lab.address || '';

  const invoiceDateStr = issued_at ? new Date(issued_at).toLocaleDateString() : new Date().toLocaleDateString();
  const dueDateStr = due_date ? new Date(due_date).toLocaleDateString() : 'Upon Receipt';

  const ops = [];

  // Helper for drawing rectangle
  function drawRect(x, y, w, h, fillRgb, strokeRgb = null, lineWidth = 1) {
    ops.push('q');
    if (fillRgb) {
      ops.push(`${fillRgb[0]} ${fillRgb[1]} ${fillRgb[2]} rg`);
    }
    if (strokeRgb) {
      ops.push(`${lineWidth} w`);
      ops.push(`${strokeRgb[0]} ${strokeRgb[1]} ${strokeRgb[2]} RG`);
    }
    ops.push(`${x} ${y} ${w} ${h} re`);
    if (fillRgb && strokeRgb) {
      ops.push('B');
    } else if (fillRgb) {
      ops.push('f');
    } else if (strokeRgb) {
      ops.push('S');
    }
    ops.push('Q');
  }

  // Helper for text
  function addText(text, x, y, font = '/F1', size = 10, rgb = [0.1, 0.1, 0.1]) {
    ops.push('BT');
    ops.push(`${rgb[0]} ${rgb[1]} ${rgb[2]} rg`);
    ops.push(`${font} ${size} Tf`);
    ops.push(`${x} ${y} Td`);
    ops.push(`(${escapePdfText(text)}) Tj`);
    ops.push('ET');
  }

  // 1. Top Accent Header Banner (Navy/Indigo)
  drawRect(36, 740, 540, 36, [0.12, 0.22, 0.42]);
  addText('CLINICPRO LABORATORY DIAGNOSTICS NETWORK', 46, 754, '/F2', 12, [1, 1, 1]);
  addText('TAX INVOICE & BILL OF SUPPLY', 395, 754, '/F2', 10, [1, 1, 1]);

  // 2. Lab Header
  addText(labName, 36, 718, '/F2', 14, [0.1, 0.15, 0.3]);
  let subY = 705;
  if (labAddress || labPhone || labEmail) {
    const contactLine = [labAddress, labPhone ? `Tel: ${labPhone}` : null, labEmail ? `Email: ${labEmail}` : null]
      .filter(Boolean)
      .join(' | ');
    addText(contactLine, 36, subY, '/F1', 8, [0.4, 0.4, 0.4]);
  }

  // 3. Invoice Summary Box (Top Right)
  drawRect(375, 645, 201, 55, [0.96, 0.97, 1.0], [0.8, 0.85, 0.95], 1);
  addText(`Invoice #: ${invoice_number}`, 385, 685, '/F2', 9, [0.1, 0.2, 0.4]);
  addText(`Date: ${invoiceDateStr}`, 385, 672, '/F1', 8.5, [0.3, 0.3, 0.3]);
  addText(`Due Date: ${dueDateStr}`, 385, 659, '/F1', 8.5, [0.3, 0.3, 0.3]);

  // Status Badge in summary box
  let statusColor = [0.2, 0.6, 0.3]; // Green for paid
  let statusText = 'STATUS: PAID';
  const normStatus = (status || '').toLowerCase();
  if (normStatus === 'partially_paid') {
    statusColor = [0.85, 0.55, 0.1];
    statusText = 'STATUS: PARTIALLY PAID';
  } else if (normStatus === 'issued') {
    statusColor = [0.8, 0.2, 0.2];
    statusText = 'STATUS: PAYMENT DUE';
  } else if (normStatus === 'draft') {
    statusColor = [0.5, 0.5, 0.5];
    statusText = 'STATUS: DRAFT';
  } else if (normStatus === 'cancelled') {
    statusColor = [0.6, 0.2, 0.2];
    statusText = 'STATUS: CANCELLED';
  }
  addText(statusText, 385, 648, '/F2', 7.5, statusColor);

  // 4. Two-Column Metadata Box (Bill To & Order Reference)
  drawRect(36, 625, 330, 75, [0.98, 0.98, 0.99], [0.88, 0.9, 0.94], 1);
  addText('BILLED TO (PATIENT):', 44, 686, '/F2', 8, [0.2, 0.3, 0.5]);
  addText(patient_name, 44, 672, '/F2', 10, [0.1, 0.1, 0.1]);
  addText(`MRN: ${patient_code} | Gender: ${patient_gender}`, 44, 659, '/F1', 8, [0.3, 0.3, 0.3]);
  addText(`Phone: ${patient_phone}`, 44, 646, '/F1', 8, [0.3, 0.3, 0.3]);
  addText(`Associated Order: ${order_number}`, 44, 633, '/F1', 8, [0.3, 0.3, 0.3]);

  // 5. Line Items Table
  const tableTop = 595;
  drawRect(36, tableTop, 540, 20, [0.15, 0.25, 0.45]); // Table Header
  addText('#', 44, tableTop + 6, '/F2', 8, [1, 1, 1]);
  addText('TEST / SERVICE DESCRIPTION', 65, tableTop + 6, '/F2', 8, [1, 1, 1]);
  addText('CODE', 290, tableTop + 6, '/F2', 8, [1, 1, 1]);
  addText('QTY', 370, tableTop + 6, '/F2', 8, [1, 1, 1]);
  addText('RATE (INR)', 430, tableTop + 6, '/F2', 8, [1, 1, 1]);
  addText('AMOUNT (INR)', 500, tableTop + 6, '/F2', 8, [1, 1, 1]);

  let currentY = tableTop - 18;
  const safeItems = Array.isArray(items) && items.length > 0 ? items : [
    { item_name: 'Diagnostic Laboratory Services', item_code: 'LAB-SRV', quantity: 1, unit_price: total_amount, total_price: total_amount }
  ];

  safeItems.forEach((item, index) => {
    const isEven = index % 2 === 0;
    if (isEven) {
      drawRect(36, currentY - 2, 540, 16, [0.97, 0.98, 1.0]);
    }
    const qty = Number(item.quantity) || 1;
    const rate = Number(item.unit_price ?? item.price ?? 0);
    const lineTotal = Number(item.total_price ?? (qty * rate));

    addText(String(index + 1), 44, currentY + 2, '/F1', 8, [0.2, 0.2, 0.2]);
    addText(String(item.item_name || 'Laboratory Test').substring(0, 42), 65, currentY + 2, '/F2', 8, [0.1, 0.1, 0.1]);
    addText(String(item.item_code || 'TEST').substring(0, 14), 290, currentY + 2, '/F1', 7.5, [0.4, 0.4, 0.4]);
    addText(String(qty), 375, currentY + 2, '/F1', 8, [0.2, 0.2, 0.2]);
    addText(rate.toFixed(2), 440, currentY + 2, '/F1', 8, [0.2, 0.2, 0.2]);
    addText(lineTotal.toFixed(2), 515, currentY + 2, '/F2', 8, [0.1, 0.1, 0.1]);

    currentY -= 17;
  });

  drawRect(36, currentY + 2, 540, 1, [0.8, 0.85, 0.9]); // Bottom separator

  // 6. Financial Summary Box (Bottom Right)
  const summaryBoxY = currentY - 80;
  drawRect(330, summaryBoxY, 246, 75, [0.98, 0.98, 0.99], [0.85, 0.88, 0.95], 1);
  addText('Subtotal:', 340, summaryBoxY + 58, '/F1', 8.5, [0.3, 0.3, 0.3]);
  addText(`INR ${Number(subtotal || total_amount).toFixed(2)}`, 495, summaryBoxY + 58, '/F1', 8.5, [0.1, 0.1, 0.1]);

  if (Number(discount) > 0) {
    addText('Discount:', 340, summaryBoxY + 46, '/F1', 8.5, [0.2, 0.6, 0.3]);
    addText(`- INR ${Number(discount).toFixed(2)}`, 490, summaryBoxY + 46, '/F1', 8.5, [0.2, 0.6, 0.3]);
  }

  drawRect(335, summaryBoxY + 38, 236, 1, [0.85, 0.85, 0.85]);
  addText('Total Amount:', 340, summaryBoxY + 26, '/F2', 9.5, [0.1, 0.1, 0.1]);
  addText(`INR ${Number(total_amount).toFixed(2)}`, 490, summaryBoxY + 26, '/F2', 9.5, [0.1, 0.15, 0.4]);

  addText('Amount Paid:', 340, summaryBoxY + 14, '/F1', 8.5, [0.2, 0.6, 0.3]);
  addText(`INR ${Number(paid_amount).toFixed(2)}`, 495, summaryBoxY + 14, '/F1', 8.5, [0.2, 0.6, 0.3]);

  addText('Balance Due:', 340, summaryBoxY + 2, '/F2', 9, Number(balance_amount) > 0 ? [0.8, 0.2, 0.2] : [0.3, 0.3, 0.3]);
  addText(`INR ${Number(balance_amount).toFixed(2)}`, 490, summaryBoxY + 2, '/F2', 9, Number(balance_amount) > 0 ? [0.8, 0.2, 0.2] : [0.3, 0.3, 0.3]);

  // 7. Payment History Section (Left of summary box or below)
  const paymentBoxY = summaryBoxY;
  drawRect(36, paymentBoxY, 280, 75, [0.99, 0.99, 1.0], [0.88, 0.9, 0.94], 1);
  addText('PAYMENT RECEIPTS / TRANSACTION LOG', 44, paymentBoxY + 60, '/F2', 8, [0.2, 0.3, 0.5]);

  if (Array.isArray(payments) && payments.length > 0) {
    let pY = paymentBoxY + 45;
    payments.slice(0, 3).forEach((p) => {
      const pDate = p.payment_date ? new Date(p.payment_date).toLocaleDateString() : 'N/A';
      const pMethod = (p.payment_method || 'CASH').toUpperCase();
      const pAmt = Number(p.amount || 0).toFixed(2);
      addText(`${pDate} - ${pMethod}: INR ${pAmt}`, 44, pY, '/F1', 7.5, [0.2, 0.5, 0.2]);
      if (p.transaction_reference) {
        addText(`Ref: ${p.transaction_reference}`, 180, pY, '/F1', 7, [0.5, 0.5, 0.5]);
      }
      pY -= 12;
    });
  } else {
    addText('No payments recorded yet.', 44, paymentBoxY + 42, '/F1', 8, [0.5, 0.5, 0.5]);
    addText('Payment is requested upon receipt of this bill.', 44, paymentBoxY + 28, '/F1', 7.5, [0.5, 0.5, 0.5]);
  }

  // 8. Footer & Authentication Note
  drawRect(36, 45, 540, 1, [0.85, 0.85, 0.85]);
  addText(`Generated on: ${invoiceDateStr} | Official Computer-Generated Tax Invoice | ClinicPro LIS`, 36, 32, '/F1', 7.5, [0.5, 0.5, 0.5]);
  addText('PAGE 1 OF 1', 520, 32, '/F2', 7.5, [0.5, 0.5, 0.5]);

  const streamContent = ops.join('\n');
  const streamLength = Buffer.byteLength(streamContent, 'utf8');

  // Assembly of standard PDF 1.4 objects
  const objects = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj');
  objects.push(
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj'
  );
  objects.push('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj');
  objects.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj');
  objects.push(`6 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}\nendstream\nendobj`);

  let offset = 0;
  const header = '%PDF-1.4\n';
  offset += Buffer.byteLength(header, 'utf8');

  const xrefEntries = ['0000000000 65535 f \n'];
  const bodyParts = [];

  for (const obj of objects) {
    xrefEntries.push(String(offset).padStart(10, '0') + ' 00000 n \n');
    const objStr = obj + '\n';
    bodyParts.push(objStr);
    offset += Buffer.byteLength(objStr, 'utf8');
  }

  const xrefOffset = offset;
  let xref = `xref\n0 ${objects.length + 1}\n` + xrefEntries.join('');
  let trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const pdfBuffer = Buffer.concat([
    Buffer.from(header, 'utf8'),
    Buffer.from(bodyParts.join(''), 'utf8'),
    Buffer.from(xref, 'utf8'),
    Buffer.from(trailer, 'utf8')
  ]);

  return pdfBuffer;
}
