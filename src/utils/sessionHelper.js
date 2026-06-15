/**
 * sessionHelper.js - Session management via Supabase.
 * Replaces the old Mongoose Session model with a Supabase `sessions` table.
 */
import { supabase } from '@/lib/supabase';
import { UAParser } from 'ua-parser-js';

/**
 * Creates a new session record in Supabase.
 */
export const createSession = async (req, user, tokens) => {
  try {
    const userAgent = req.headers.get('user-agent') || '';
    const parser = new UAParser(userAgent);
    const ua = parser.getResult();
    const ipRaw = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const ip = ipRaw.split(',')[0].trim();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7-day refresh token

    await supabase.from('sessions').insert([{
      user_id: user.id || user._id,
      user_role: user.role,
      refresh_token: tokens.refreshToken,
      ip_address: ip,
      device: ua.device?.type || 'desktop',
      browser: ua.browser?.name || 'unknown',
      os: ua.os?.name || 'unknown',
      expires_at: expiresAt.toISOString(),
      is_active: true,
      last_activity_at: new Date().toISOString(),
    }]);
  } catch (err) {
    console.error('[SESSION ERROR] Failed to create session:', err.message);
    // Non-fatal: login continues even if session recording fails
  }
};

/**
 * Invalidates a session by refresh token.
 */
export const invalidateSession = async (refreshToken) => {
  try {
    await supabase
      .from('sessions')
      .update({ is_active: false })
      .eq('refresh_token', refreshToken);
  } catch (err) {
    console.error('[SESSION ERROR] Failed to invalidate session:', err.message);
  }
};

/**
 * Invalidates ALL sessions for a user (logout-all).
 */
export const invalidateAllSessions = async (userId) => {
  try {
    await supabase
      .from('sessions')
      .update({ is_active: false })
      .eq('user_id', userId);
  } catch (err) {
    console.error('[SESSION ERROR] Failed to invalidate all sessions:', err.message);
  }
};

/**
 * Finds an active session by refresh token.
 */
export const findSession = async (refreshToken) => {
  try {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('refresh_token', refreshToken)
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('[SESSION ERROR] Failed to find session:', err.message);
    return null;
  }
};

/**
 * Gets all active sessions for a user.
 */
export const getUserSessions = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('sessions')
      .select('id, ip_address, device, browser, os, last_activity_at, created_at')
      .eq('user_id', userId)
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString())
      .order('last_activity_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('[SESSION ERROR] Failed to get user sessions:', err.message);
    return [];
  }
};
