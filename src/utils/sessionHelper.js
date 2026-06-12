import { UAParser } from 'ua-parser-js';
import Session from '../models/Session';

/**
 * Utility to reliably create an active session with full device and browser tracking.
 * @param {Request} req The incoming HTTP Request
 * @param {Object} user The user document or object
 * @param {Object} tokens { accessToken, refreshToken }
 */
export async function createSession(req, user, tokens) {
  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
  const userAgentStr = req.headers.get('user-agent') || '';
  
  const parser = new UAParser(userAgentStr);
  const result = parser.getResult();
  
  const browser = result.browser.name 
    ? `${result.browser.name} ${result.browser.version || ''}`.trim() 
    : 'Unknown Browser';
    
  const os = result.os.name 
    ? `${result.os.name} ${result.os.version || ''}`.trim() 
    : 'Unknown OS';
    
  const deviceType = result.device.type || 'desktop';
  const deviceVendor = result.device.vendor || 'Unknown Vendor';
  const deviceModel = result.device.model || 'Unknown Model';
  const deviceStr = deviceType === 'desktop' ? 'Desktop' : `${deviceVendor} ${deviceModel}`.trim();

  await Session.create({
    userId: user._id || user.id,
    userRole: user.role,
    refreshToken: tokens.refreshToken,
    ipAddress: ip,
    device: deviceStr,
    browser: browser,
    os: os,
    lastActivityAt: Date.now(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  });
}
