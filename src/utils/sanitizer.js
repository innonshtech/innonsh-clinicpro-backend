import xss from 'xss';

/**
 * Deep sanitization of objects/arrays to prevent SQL injection and XSS.
 * mongo-sanitize has been removed since we are no longer using MongoDB.
 * SQL injection is prevented by Supabase's parameterized queries.
 * We keep XSS sanitization to protect HTML output.
 *
 * @param {any} data - The data to sanitize
 * @returns {any} - The sanitized data
 */
export const sanitizeData = (data) => {
  if (data === null || typeof data === 'undefined') {
    return data;
  }

  if (typeof data === 'string') {
    // Escape XSS payloads
    return xss(data);
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeData(item));
  }

  if (typeof data === 'object') {
    const sanitizedObj = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        sanitizedObj[key] = sanitizeData(data[key]);
      }
    }
    return sanitizedObj;
  }

  return data;
};
