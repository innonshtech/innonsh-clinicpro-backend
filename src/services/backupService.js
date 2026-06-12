import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import crypto from 'crypto';

const execPromise = promisify(exec);

const ALGORITHM = 'aes-256-cbc';
const RETENTION_DAYS = 7;

/**
 * Service to handle automated database backups, encryption, and restores.
 */
export const backupService = {
  getBackupDir() {
    const dir = path.join(process.cwd(), 'backups');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  },

  getEncryptionKey() {
    const key = process.env.BACKUP_ENCRYPTION_KEY;
    if (!key || key.length !== 64) {
      throw new Error('BACKUP_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).');
    }
    return Buffer.from(key, 'hex');
  },

  /**
   * Create a new encrypted database backup and prune old backups.
   */
  async createBackup() {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI not defined');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const tempFilename = `backup-${timestamp}.gz`;
    const finalFilename = `backup-${timestamp}.gz.enc`;
    
    const tempFilepath = path.join(this.getBackupDir(), tempFilename);
    const finalFilepath = path.join(this.getBackupDir(), finalFilename);

    // 1. Create native gzip backup
    const command = `mongodump --uri="${uri}" --archive="${tempFilepath}" --gzip`;

    try {
      await execPromise(command);
      console.log(`[BACKUP] Initial dump created: ${tempFilename}`);

      // 2. Encrypt the backup using AES-256-CBC
      const key = this.getEncryptionKey();
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

      const input = fs.createReadStream(tempFilepath);
      const output = fs.createWriteStream(finalFilepath);

      // Write the IV to the beginning of the encrypted file
      output.write(iv);

      await new Promise((resolve, reject) => {
        input.pipe(cipher).pipe(output)
          .on('finish', resolve)
          .on('error', reject);
      });

      // 3. Clean up the unencrypted temp file
      fs.unlinkSync(tempFilepath);
      console.log(`[BACKUP] Backup encrypted securely: ${finalFilename}`);

      // 4. Run retention policy sweep
      this.pruneOldBackups();

      return {
        success: true,
        filename: finalFilename,
        filepath: finalFilepath,
        message: 'Backup created and encrypted successfully.'
      };
    } catch (error) {
      console.error(`[BACKUP ERROR] ${error.message}`);
      // Attempt cleanup
      if (fs.existsSync(tempFilepath)) fs.unlinkSync(tempFilepath);
      throw error;
    }
  },

  /**
   * Prune backups older than the retention policy (7 days).
   */
  pruneOldBackups() {
    const dir = this.getBackupDir();
    const now = Date.now();
    const retentionMs = RETENTION_DAYS * 24 * 60 * 60 * 1000;

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.gz.enc'));
    for (const file of files) {
      const filepath = path.join(dir, file);
      const stats = fs.statSync(filepath);
      if (now - stats.birthtimeMs > retentionMs) {
        fs.unlinkSync(filepath);
        console.log(`[BACKUP RETENTION] Deleted old backup: ${file}`);
      }
    }
  },

  /**
   * List all available encrypted backups.
   */
  async listBackups() {
    const dir = this.getBackupDir();
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.gz.enc'))
      .map(f => {
        const stats = fs.statSync(path.join(dir, f));
        return {
          filename: f,
          size: stats.size,
          createdAt: stats.birthtime
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);

    return files;
  },

  /**
   * Restore the database from an encrypted backup file.
   * WARNING: This will overwrite existing data.
   */
  async restoreBackup(filename) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI not defined');

    const filepath = path.join(this.getBackupDir(), filename);
    if (!fs.existsSync(filepath)) throw new Error('Backup file not found');

    const tempFilename = filename.replace('.enc', '');
    const tempFilepath = path.join(this.getBackupDir(), tempFilename);

    try {
      // 1. Decrypt the backup
      const key = this.getEncryptionKey();
      
      const fileData = fs.readFileSync(filepath);
      const iv = fileData.slice(0, 16);
      const encryptedData = fileData.slice(16);

      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      const output = fs.createWriteStream(tempFilepath);

      await new Promise((resolve, reject) => {
        decipher.pipe(output)
          .on('finish', resolve)
          .on('error', reject);
        
        decipher.write(encryptedData);
        decipher.end();
      });

      console.log(`[RESTORE] Backup decrypted locally.`);

      // 2. Restore using mongorestore
      const command = `mongorestore --uri="${uri}" --archive="${tempFilepath}" --gzip --drop`;
      const { stdout, stderr } = await execPromise(command);

      // 3. Clean up unencrypted file
      fs.unlinkSync(tempFilepath);
      
      console.log(`[RESTORE] Database restored successfully from: ${filename}`);
      return {
        success: true,
        stdout,
        stderr
      };
    } catch (error) {
      console.error(`[RESTORE ERROR] ${error.message}`);
      if (fs.existsSync(tempFilepath)) fs.unlinkSync(tempFilepath);
      throw error;
    }
  }
};
