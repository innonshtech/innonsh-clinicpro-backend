import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { jwtVerify } from 'jose';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Strict limits for nurse photos
export const MAX_PHOTO_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

export const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp'
]);

export const ALLOWED_IMAGE_EXTS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp'
]);

export const POST = withErrorHandler(async (req) => {
  // Authenticate user via middleware headers or Bearer JWT
  let user = null;
  const authHeader = req.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'default-secret');
      const { payload } = await jwtVerify(token, secret);
      user = payload;
    } catch (_) {}
  }

  if (!user && req.headers.get('x-user-id')) {
    user = {
      id: req.headers.get('x-user-id'),
      role: req.headers.get('x-user-role'),
      clinicId: req.headers.get('x-user-clinic-id')
    };
  }

  if (!user || !['clinic', 'admin', 'doctor'].includes(user.role)) {
    return ApiResponse.error(
      'Unauthorized: Must be an authenticated clinic or admin user to upload staff photos.',
      'UNAUTHORIZED',
      [],
      401
    );
  }

  const contentType = req.headers.get('content-type') || '';
  let buffer = null;
  let originalName = 'photo.jpg';
  let mimeType = 'image/jpeg';
  let fileSize = 0;
  const clinicId = user.clinicId || 'general';

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData();
    const file = formData.get('file') || formData.get('photo');
    if (!file) {
      return ApiResponse.error('No photo file uploaded in request.', 'MISSING_FILE', [], 400);
    }
    originalName = file.name || 'photo.jpg';
    mimeType = file.type || '';
    fileSize = file.size;

    // 1. File size check (2 MB limit)
    if (fileSize > MAX_PHOTO_SIZE_BYTES) {
      return ApiResponse.error(
        `Photo size exceeds the 2MB limit. (Provided: ${(fileSize / (1024 * 1024)).toFixed(2)}MB)`,
        'FILE_TOO_LARGE',
        [],
        400
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } else if (contentType.includes('application/json')) {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return ApiResponse.error('Invalid JSON body', 'BAD_REQUEST', [], 400);
    }

    if (!body.fileBase64 && !body.photoBase64) {
      return ApiResponse.error('No photo data provided.', 'MISSING_FILE', [], 400);
    }

    originalName = body.fileName || body.filename || 'photo.jpg';
    mimeType = body.mimeType || body.type || 'image/jpeg';

    const base64Data = (body.fileBase64 || body.photoBase64).replace(/^data:image\/[a-z]+;base64,/, '');
    buffer = Buffer.from(base64Data, 'base64');
    fileSize = buffer.length;

    // 1. File size check (2 MB limit)
    if (fileSize > MAX_PHOTO_SIZE_BYTES) {
      return ApiResponse.error(
        `Photo size exceeds the 2MB limit. (Provided: ${(fileSize / (1024 * 1024)).toFixed(2)}MB)`,
        'FILE_TOO_LARGE',
        [],
        400
      );
    }
  } else {
    return ApiResponse.error('Unsupported content type. Use multipart/form-data or application/json.', 'BAD_REQUEST', [], 400);
  }

  // 2. MIME type check
  if (!ALLOWED_IMAGE_MIMES.has(mimeType.toLowerCase())) {
    return ApiResponse.error(
      `Invalid photo type '${mimeType}'. Allowed formats: JPG, PNG, WEBP.`,
      'INVALID_FILE_TYPE',
      [],
      400
    );
  }

  // 3. Extension check
  const ext = path.extname(originalName).toLowerCase();
  if (!ALLOWED_IMAGE_EXTS.has(ext)) {
    return ApiResponse.error(
      `Invalid photo extension '${ext}'. Allowed extensions: .jpg, .jpeg, .png, .webp.`,
      'INVALID_FILE_TYPE',
      [],
      400
    );
  }

  // 4. Generate clinic-scoped safe unique file path
  const randomHex = crypto.randomBytes(8).toString('hex');
  const safeFilename = `nurse-${Date.now()}-${randomHex}${ext}`;
  const uploadsDir = path.resolve(process.cwd(), 'public', 'uploads', 'nurses', clinicId);

  try {
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      const fullFilePath = path.join(uploadsDir, safeFilename);
      fs.writeFileSync(fullFilePath, buffer);

      // Also sync to frontend public/uploads in local dev environment
      const frontendUploadsDir = path.resolve(process.cwd(), '..', '..', '..', 'innonsh-clinicpro-Frontend', 'public', 'uploads', 'nurses', clinicId);
      const frontendAltDir = 'C:/Users/HP/Desktop/clinicPro/innonsh-clinicpro-Frontend/public/uploads/nurses/' + clinicId;
      for (const fDir of [frontendUploadsDir, frontendAltDir]) {
        try {
          if (!fs.existsSync(fDir)) {
            fs.mkdirSync(fDir, { recursive: true });
          }
          fs.writeFileSync(path.join(fDir, safeFilename), buffer);
        } catch (_) {}
      }
    } catch (e) {
      console.error('File write error:', e);
    }

  const publicUrl = `/uploads/nurses/${clinicId}/${safeFilename}`;

  return ApiResponse.success({
    url: publicUrl,
    fileName: safeFilename,
    size: fileSize,
    mimeType
  }, 'Photo uploaded successfully', 201);
});
