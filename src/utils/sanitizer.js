import mongoSanitize from 'mongo-sanitize';
import xss from 'xss';

/**
 * Deep sanitization of objects/arrays to prevent NoSQL injection and XSS.
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
        // First remove prohibited mongo keys starting with '$'
        const cleanKey = key.replace(/^\$/, '');
        sanitizedObj[cleanKey] = sanitizeData(data[key]);
      }
    }
    // Also use the robust mongo-sanitize which strips keys containing '$' 
    return mongoSanitize(sanitizedObj);
  }

  return data;
};
