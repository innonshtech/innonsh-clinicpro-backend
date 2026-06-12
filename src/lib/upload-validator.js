import path from 'path';
import crypto from 'crypto';

// Strict limits
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

export const ALLOWED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.pdf',
]);

export const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.sh', '.bat', '.cmd', '.js', '.php', '.py', '.html', '.htm', '.vbs', '.dll', '.msi'
]);

/**
 * Validates a file object from a Next.js App Router formData() request.
 * 
 * @param {File} file - The file object from FormData
 * @returns {{ isValid: boolean, error?: string, sanitizedName?: string }}
 */
export function validateUpload(file) {
  if (!file || typeof file !== 'object' || !file.name) {
    return { isValid: false, error: 'Invalid file object provided.' };
  }

  // 1. File Size Validation
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { isValid: false, error: `File size exceeds the 5MB limit. (Provided: ${(file.size / 1024 / 1024).toFixed(2)}MB)` };
  }

  // 2. MIME Type Validation
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { isValid: false, error: `MIME type '${file.type}' is not allowed.` };
  }

  // 3. Extension Validation
  const originalName = file.name;
  const ext = path.extname(originalName).toLowerCase();
  
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { isValid: false, error: `File extension '${ext}' is not allowed.` };
  }

  if (BLOCKED_EXTENSIONS.has(ext)) {
    return { isValid: false, error: `Executable or script files are strictly blocked.` };
  }

  // 4. Filename Sanitization
  // Remove directory paths to prevent path traversal, and strip unsafe characters
  let cleanName = path.basename(originalName);
  cleanName = cleanName.replace(/[^a-zA-Z0-9.\-_]/g, '');

  // If sanitization removes everything (e.g. filename was purely special chars), provide a fallback
  if (!cleanName || cleanName === ext) {
    cleanName = `upload${ext}`;
  }

  // 5. Generate Safe Unique Filename
  // Prepend a random hex string + timestamp to ensure uniqueness and prevent simple guessing or collisions
  const randomPrefix = crypto.randomBytes(8).toString('hex');
  const timestamp = Date.now();
  const sanitizedName = `${timestamp}-${randomPrefix}-${cleanName}`;

  return {
    isValid: true,
    sanitizedName
  };
}
