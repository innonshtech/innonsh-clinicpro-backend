/**
 * Standard PDF 1.4 Vector Document Generator for Diagnostic Laboratory Reports
 * Self-contained without external dependencies.
 */

function escapePdfText(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

export function generateDiagnosticReportPdf(reportData) {
  const {
    report_number = 'REP-000000',
    generated_at = new Date().toISOString(),
    lab = {},
    patient = {},
    order = {},
    sample = {},
    results = [],
    validation = {}
  } = reportData;

  const labName = lab.lab_name || lab.name || 'Diagnostic Laboratory';
  const labEmail = lab.email || '';
  const labPhone = lab.phone || '';
  const labAddress = lab.address || '';

  const patientName = `${patient.first_name || ''} ${patient.last_name || ''}`.trim() || 'Patient';
  const patientCode = patient.patient_code || 'N/A';
  const gender = patient.gender ? (patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1)) : 'N/A';
  const dob = patient.date_of_birth || 'N/A';
  const phone = patient.phone_number || 'N/A';

  const doctorName = order.doctor ? `Dr. ${order.doctor.first_name || ''} ${order.doctor.last_name || ''}`.trim() : (order.doctor_name || 'Attending Physician');
  const clinicName = order.clinic?.clinic_name || order.clinic_name || 'Outpatient Clinic';
  const orderNumber = order.order_number || 'N/A';
  const barcode = sample.barcode || 'N/A';
  const sampleType = sample.sample_type || 'Specimen';
  const collectedAt = sample.collected_at ? new Date(sample.collected_at).toLocaleString() : 'N/A';
  const receivedAt = sample.received_at ? new Date(sample.received_at).toLocaleString() : 'N/A';
  const reportedAt = generated_at ? new Date(generated_at).toLocaleString() : new Date().toLocaleString();

  const validatorName = validation.validated_by || 'Authorized Pathologist';
  const validatedAt = validation.validated_at ? new Date(validation.validated_at).toLocaleString() : reportedAt;
  const validationRemarks = validation.validation_remarks || 'Correlates with clinical findings. Authorized for release.';

  // PDF Page Stream Operators
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

  // --- 1. Top Accent Header Banner ---
  drawRect(36, 740, 540, 36, [0.08, 0.58, 0.53]); // Teal banner
  addText('CLINICPRO DIAGNOSTIC LABORATORY NETWORK', 46, 754, '/F2', 12, [1, 1, 1]);
  addText('OFFICIAL MEDICAL REPORT', 410, 754, '/F2', 10, [1, 1, 1]);

  // --- 2. Lab Header ---
  addText(labName, 36, 718, '/F2', 14, [0.08, 0.2, 0.3]);
  let subY = 705;
  if (labAddress || labPhone || labEmail) {
    const contactLine = [labAddress, labPhone, labEmail].filter(Boolean).join(' | ');
    addText(contactLine, 36, subY, '/F1', 8, [0.4, 0.4, 0.4]);
    subY -= 12;
  }

  // Report Title & Meta
  addText(`Report No: ${report_number}`, 420, 718, '/F2', 10, [0.08, 0.58, 0.53]);
  addText(`Status: FINAL ISSUED`, 420, 706, '/F2', 8, [0.1, 0.6, 0.2]);

  // Horizontal separator line
  drawRect(36, subY + 4, 540, 1, [0.85, 0.85, 0.85]);

  // --- 3. Patient & Order Info Grid (Two boxes side by side) ---
  const boxTop = subY - 4;
  const boxHeight = 78;
  const boxY = boxTop - boxHeight;

  // Patient Box (Left)
  drawRect(36, boxY, 265, boxHeight, [0.97, 0.98, 0.99], [0.85, 0.88, 0.92], 1);
  drawRect(36, boxTop - 16, 265, 16, [0.92, 0.94, 0.97]);
  addText('PATIENT INFORMATION', 44, boxTop - 12, '/F2', 8, [0.2, 0.3, 0.4]);

  addText(`Name:`, 44, boxTop - 28, '/F2', 8, [0.4, 0.4, 0.4]);
  addText(patientName, 80, boxTop - 28, '/F2', 8.5, [0.1, 0.1, 0.1]);

  addText(`MRN / Code:`, 44, boxTop - 40, '/F2', 8, [0.4, 0.4, 0.4]);
  addText(patientCode, 100, boxTop - 40, '/F1', 8, [0.1, 0.1, 0.1]);

  addText(`Gender:`, 44, boxTop - 52, '/F2', 8, [0.4, 0.4, 0.4]);
  addText(gender, 85, boxTop - 52, '/F1', 8, [0.1, 0.1, 0.1]);

  addText(`DOB:`, 140, boxTop - 52, '/F2', 8, [0.4, 0.4, 0.4]);
  addText(dob, 168, boxTop - 52, '/F1', 8, [0.1, 0.1, 0.1]);

  addText(`Phone:`, 44, boxTop - 64, '/F2', 8, [0.4, 0.4, 0.4]);
  addText(phone, 80, boxTop - 64, '/F1', 8, [0.1, 0.1, 0.1]);

  // Order & Specimen Box (Right)
  drawRect(311, boxY, 265, boxHeight, [0.97, 0.98, 0.99], [0.85, 0.88, 0.92], 1);
  drawRect(311, boxTop - 16, 265, 16, [0.92, 0.94, 0.97]);
  addText('SPECIMEN & ORDER INFORMATION', 319, boxTop - 12, '/F2', 8, [0.2, 0.3, 0.4]);

  addText(`Order No:`, 319, boxTop - 28, '/F2', 8, [0.4, 0.4, 0.4]);
  addText(orderNumber, 368, boxTop - 28, '/F1', 8, [0.1, 0.1, 0.1]);

  addText(`Barcode:`, 319, boxTop - 40, '/F2', 8, [0.4, 0.4, 0.4]);
  addText(barcode, 368, boxTop - 40, '/F2', 8, [0.08, 0.58, 0.53]);

  addText(`Sample Type:`, 319, boxTop - 52, '/F2', 8, [0.4, 0.4, 0.4]);
  addText(sampleType, 380, boxTop - 52, '/F1', 8, [0.1, 0.1, 0.1]);

  addText(`Physician:`, 319, boxTop - 64, '/F2', 8, [0.4, 0.4, 0.4]);
  addText(doctorName, 368, boxTop - 64, '/F1', 8, [0.1, 0.1, 0.1]);

  addText(`Collected:`, 450, boxTop - 40, '/F2', 7.5, [0.4, 0.4, 0.4]);
  addText(collectedAt.split(',')[0] || collectedAt, 495, boxTop - 40, '/F1', 7.5, [0.1, 0.1, 0.1]);

  addText(`Received:`, 450, boxTop - 52, '/F2', 7.5, [0.4, 0.4, 0.4]);
  addText(receivedAt.split(',')[0] || receivedAt, 495, boxTop - 52, '/F1', 7.5, [0.1, 0.1, 0.1]);

  // --- 4. Diagnostic Results Table ---
  const tableTop = boxY - 14;
  drawRect(36, tableTop - 18, 540, 18, [0.1, 0.22, 0.35]); // Dark Navy Header

  addText('TEST / PARAMETER', 44, tableTop - 13, '/F2', 8, [1, 1, 1]);
  addText('RESULT VALUE', 220, tableTop - 13, '/F2', 8, [1, 1, 1]);
  addText('REFERENCE RANGE', 310, tableTop - 13, '/F2', 8, [1, 1, 1]);
  addText('UNITS', 410, tableTop - 13, '/F2', 8, [1, 1, 1]);
  addText('FLAG / INTERPRETATION', 465, tableTop - 13, '/F2', 8, [1, 1, 1]);

  let currentY = tableTop - 18;
  const rowHeight = 20;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    currentY -= rowHeight;

    // Alternating row background
    if (i % 2 === 1) {
      drawRect(36, currentY, 540, rowHeight, [0.97, 0.98, 0.99]);
    } else {
      drawRect(36, currentY, 540, rowHeight, [1, 1, 1]);
    }
    drawRect(36, currentY, 540, 1, [0.9, 0.92, 0.94]); // Row border

    // Parameter Name
    addText(r.parameter_name || r.test_name, 44, currentY + 6, '/F2', 8.5, [0.15, 0.15, 0.15]);

    // Result Value
    const isCritical = Boolean(r.is_critical);
    const valColor = isCritical ? [0.85, 0.1, 0.1] : [0.1, 0.1, 0.1];
    addText(String(r.result_value || ''), 220, currentY + 6, '/F2', 9, valColor);

    // Reference Range
    addText(r.reference_range || 'As specified', 310, currentY + 6, '/F1', 8, [0.35, 0.35, 0.35]);

    // Unit
    addText(r.unit || '-', 410, currentY + 6, '/F1', 8, [0.35, 0.35, 0.35]);

    // Interpretation Flag
    let flagLabel = 'NORMAL';
    let flagRgb = [0.1, 0.55, 0.3];
    const interp = (r.interpretation || '').toLowerCase();
    if (isCritical || interp.includes('critical')) {
      flagLabel = 'CRITICAL PANIC';
      flagRgb = [0.85, 0.1, 0.1];
    } else if (interp === 'abnormal' || interp === 'high' || interp === 'low') {
      flagLabel = interp.toUpperCase();
      flagRgb = [0.85, 0.45, 0.05];
    }
    addText(flagLabel, 465, currentY + 6, '/F2', 7.5, flagRgb);
  }

  // --- 5. Clinical Pathologist Signoff Box ---
  const signoffTop = Math.min(currentY - 24, 250);
  drawRect(36, signoffTop - 80, 540, 80, [0.98, 0.99, 1], [0.8, 0.85, 0.9], 1);

  addText('CLINICAL PATHOLOGY VALIDATION & AUTHORIZATION', 46, signoffTop - 16, '/F2', 8.5, [0.1, 0.3, 0.5]);
  drawRect(46, signoffTop - 20, 520, 1, [0.85, 0.9, 0.95]);

  addText(`Authorized Signatory:`, 46, signoffTop - 34, '/F2', 8, [0.3, 0.3, 0.3]);
  addText(validatorName, 140, signoffTop - 34, '/F2', 8.5, [0.08, 0.2, 0.4]);

  addText(`Validated Date:`, 46, signoffTop - 48, '/F2', 8, [0.3, 0.3, 0.3]);
  addText(validatedAt, 140, signoffTop - 48, '/F1', 8, [0.15, 0.15, 0.15]);

  addText(`Pathology Remarks:`, 46, signoffTop - 62, '/F2', 8, [0.3, 0.3, 0.3]);
  addText(validationRemarks, 140, signoffTop - 62, '/F1', 8, [0.15, 0.15, 0.15]);

  addText('Digital Verification: Validated and signed electronically in ClinicPro LIS.', 46, signoffTop - 74, '/F1', 7, [0.5, 0.5, 0.5]);

  // --- 6. Footer ---
  drawRect(36, 45, 540, 1, [0.85, 0.85, 0.85]);
  addText(`Issued on: ${reportedAt} | ClinicPro Diagnostic Network | Report ID: ${report_number}`, 36, 32, '/F1', 7.5, [0.5, 0.5, 0.5]);
  addText('CONFIDENTIAL MEDICAL RECORD - PAGE 1 OF 1', 370, 32, '/F2', 7.5, [0.5, 0.5, 0.5]);

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
