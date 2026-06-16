import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ALGORITHM = 'aes-256-cbc';

// ----------------------------------------------------------------------------------
// IMPORTANT: Please make sure process.env.PATIENT_ENCRYPTION_KEY is set to your old
// 32-byte encryption key (64 hex characters) in your .env file before running this.
// ----------------------------------------------------------------------------------
const getEncryptionKey = () => {
  const keyHex = process.env.PATIENT_ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error('Missing PATIENT_ENCRYPTION_KEY in .env');
  }
  
  // If the old system padded the key, or used it directly, we format it as a 32-byte buffer
  let keyBuf = Buffer.from(keyHex);
  if (keyBuf.length === 64) {
    keyBuf = Buffer.from(keyHex, 'hex'); // If it was stored as a hex string
  } else if (keyBuf.length < 32) {
    keyBuf = Buffer.concat([keyBuf, Buffer.alloc(32 - keyBuf.length, 0)]); // Pad to 32 bytes
  } else if (keyBuf.length > 32) {
    keyBuf = keyBuf.slice(0, 32);
  }
  return keyBuf;
};

const decryptField = (encryptedText, key) => {
  if (!encryptedText || typeof encryptedText !== 'string' || !encryptedText.includes(':')) {
    return encryptedText; // Not encrypted, or already decrypted
  }

  try {
    const [ivHex, cipherHex] = encryptedText.split(':');
    if (!ivHex || !cipherHex) return encryptedText;

    const iv = Buffer.from(ivHex, 'hex');
    const encryptedData = Buffer.from(cipherHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedData);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    console.error(`  [!] Failed to decrypt text: ${encryptedText.substring(0, 20)}...`);
    return encryptedText; // Return original on failure to prevent data loss
  }
};

async function migrate() {
  console.log('Starting Patient Decryption Migration...');
  
  let key;
  try {
    key = getEncryptionKey();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  // 1. Fetch all patients
  const { data: patients, error } = await supabase
    .from('patients')
    .select('id, medical_history, allergies');

  if (error) {
    console.error('Failed to fetch patients:', error);
    process.exit(1);
  }

  let decryptedCount = 0;

  // 2. Decrypt and update
  for (const patient of patients) {
    let needsUpdate = false;
    const updates = {};

    // Check medical_history
    if (patient.medical_history && patient.medical_history.includes(':')) {
      const decrypted = decryptField(patient.medical_history, key);
      if (decrypted !== patient.medical_history) {
        updates.medical_history = decrypted;
        needsUpdate = true;
      }
    }

    // Check allergies
    if (patient.allergies && patient.allergies.includes(':')) {
      const decrypted = decryptField(patient.allergies, key);
      if (decrypted !== patient.allergies) {
        updates.allergies = decrypted;
        needsUpdate = true;
      }
    }

    // Apply updates if any
    if (needsUpdate) {
      const { error: updateError } = await supabase
        .from('patients')
        .update(updates)
        .eq('id', patient.id);

      if (updateError) {
        console.error(`Failed to update patient ${patient.id}:`, updateError);
      } else {
        decryptedCount++;
        console.log(`  ✓ Decrypted records for patient: ${patient.id}`);
      }
    }
  }

  console.log(`\nMigration complete! Successfully decrypted ${decryptedCount} patients.`);
}

migrate();
