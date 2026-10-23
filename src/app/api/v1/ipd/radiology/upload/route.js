import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB for radiology / DICOM / PDF

export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/dicom',
  'application/octet-stream'
]);

export const ALLOWED_EXTS = new Set([
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.dcm'
]);

// POST /api/v1/ipd/radiology/upload - Upload radiology scan / PDF report
export const POST = withErrorHandler(
  withRoles(['lab', 'doctor', 'clinic', 'admin'], async (req) => {
    const contentType = req.headers.get('content-type') || '';
    let buffer = null;
    let originalName = 'radiology_report.pdf';
    let mimeType = 'application/pdf';
    let fileSize = 0;
    const clinicId = req.user?.clinicId || 'general';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') || formData.get('report') || formData.get('scan');
      if (!file) {
        return ApiResponse.error('No file uploaded in request', 'MISSING_FILE', [], 400);
      }
      originalName = file.name || 'radiology_report.pdf';
      mimeType = file.type || 'application/pdf';
      fileSize = file.size;

      if (fileSize > MAX_FILE_SIZE_BYTES) {
        return ApiResponse.error(
          `File size exceeds the 10MB limit. (Provided: ${(fileSize / (1024 * 1024)).toFixed(2)}MB)`,
          'FILE_TOO_LARGE',
          [],
          400
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } else if (contentType.includes('application/json')) {
      let body;
      try { body = await req.json(); } catch (e) {
        return ApiResponse.error('Invalid JSON body', 'BAD_REQUEST', [], 400);
      }

      if (!body.fileBase64 && !body.base64Data && !body.content) {
        return ApiResponse.error('No file data provided in body', 'MISSING_FILE', [], 400);
      }

      originalName = body.fileName || body.filename || 'radiology_report.pdf';
      mimeType = body.mimeType || body.type || 'application/pdf';

      const base64Str = (body.fileBase64 || body.base64Data || body.content).replace(/^data:[^;]+;base64,/, '');
      buffer = Buffer.from(base64Str, 'base64');
      fileSize = buffer.length;

      if (fileSize > MAX_FILE_SIZE_BYTES) {
        return ApiResponse.error(
          `File size exceeds the 10MB limit. (Provided: ${(fileSize / (1024 * 1024)).toFixed(2)}MB)`,
          'FILE_TOO_LARGE',
          [],
          400
        );
      }
    } else {
      return ApiResponse.error('Unsupported content type. Use multipart/form-data or application/json', 'BAD_REQUEST', [], 400);
    }

    const ext = path.extname(originalName).toLowerCase() || '.pdf';
    if (!ALLOWED_EXTS.has(ext)) {
      return ApiResponse.error(
        `Invalid file extension '${ext}'. Allowed extensions: PDF, JPG, PNG, WEBP, DCM`,
        'INVALID_FILE_TYPE',
        [],
        400
      );
    }

    // Generate safe unique filename
    const randomHex = crypto.randomBytes(8).toString('hex');
    const safeFilename = `rad-${Date.now()}-${randomHex}${ext}`;
    const uploadsDir = path.resolve(process.cwd(), 'public', 'uploads', 'radiology', clinicId);

    try {
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      fs.writeFileSync(path.join(uploadsDir, safeFilename), buffer);

      // Sync to frontend public in dev environment
      const feUploadsDir = path.resolve(process.cwd(), '..', '..', '..', 'innonsh-clinicpro-Frontend', 'public', 'uploads', 'radiology', clinicId);
      const feAltDir = 'C:/Users/HP/Desktop/clinicPro/innonsh-clinicpro-Frontend/public/uploads/radiology/' + clinicId;
      for (const d of [feUploadsDir, feAltDir]) {
        try {
          if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
          fs.writeFileSync(path.join(d, safeFilename), buffer);
        } catch (_) {}
      }
    } catch (err) {
      console.error('File write error:', err);
    }

    const publicUrl = `/uploads/radiology/${clinicId}/${safeFilename}`;

    return ApiResponse.success({
      url: publicUrl,
      fileName: originalName,
      file_name: originalName,
      file_url: publicUrl,
      size: fileSize,
      file_size: fileSize,
      mimeType,
      mime_type: mimeType
    }, 'Radiology file uploaded successfully', 201);
  })
);
