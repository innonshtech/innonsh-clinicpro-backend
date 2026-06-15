/**
 * db.js - Supabase connection singleton.
 * Replaces the old MongoDB/Mongoose dbConnect utility.
 * The Supabase client is already initialized as a singleton in src/lib/supabase.js,
 * so this file simply re-exports it and performs a lightweight health-check
 * the very first time it is called (to keep the same `await dbConnect()` call-pattern
 * that every service file uses).
 */
import { supabase } from '@/lib/supabase';

let connected = false;

async function dbConnect() {
  if (connected) return supabase;

  try {
    // Lightweight ping: select 1 from admins (or any table). 
    // If credentials are not yet provided this will warn but NOT crash the import.
    const { error } = await supabase.from('admins').select('id').limit(1);
    if (error && error.code !== 'PGRST116') {
      // PGRST116 = "table not found" which is fine during initial setup
      console.warn('[Supabase] Connection check warning:', error.message);
    } else {
      console.log('✅ Supabase connected successfully');
    }
    connected = true;
  } catch (e) {
    console.error('❌ Supabase connection failed:', e.message);
    // We don't throw here so the app still boots without credentials.
    // Once real credentials are provided, it will connect automatically.
  }

  return supabase;
}

export default dbConnect;
