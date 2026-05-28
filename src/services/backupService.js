import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';

const execPromise = promisify(exec);

/**
 * Service to handle database backups and restores.
 */
export const backupService = {
  getBackupDir() {
    const dir = path.join(process.cwd(), 'backups');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  },

  /**
   * Create a new database backup.
   */
  async createBackup() {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI not defined');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${timestamp}.gz`;
    const filepath = path.join(this.getBackupDir(), filename);

    // Use mongodump with --archive and --gzip for a single compressed file
    // Note: This requires mongodump to be installed on the host system
    const command = `mongodump --uri="${uri}" --archive="${filepath}" --gzip`;

    try {
      const { stdout, stderr } = await execPromise(command);
      console.log(`[BACKUP] Backup created: ${filename}`);
      return {
        success: true,
        filename,
        filepath,
        stdout,
        stderr
      };
    } catch (error) {
      console.error(`[BACKUP ERROR] ${error.message}`);
      throw error;
    }
  },

  /**
   * List all available backups.
   */
  async listBackups() {
    const dir = this.getBackupDir();
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.gz'))
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
   * Restore the database from a backup file.
   * WARNING: This will overwrite existing data.
   */
  async restoreBackup(filename) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI not defined');

    const filepath = path.join(this.getBackupDir(), filename);
    if (!fs.existsSync(filepath)) throw new Error('Backup file not found');

    // Use mongorestore with --archive and --gzip
    // --drop ensures we overwrite existing collections
    const command = `mongorestore --uri="${uri}" --archive="${filepath}" --gzip --drop`;

    try {
      const { stdout, stderr } = await execPromise(command);
      console.log(`[RESTORE] Database restored from: ${filename}`);
      return {
        success: true,
        stdout,
        stderr
      };
    } catch (error) {
      console.error(`[RESTORE ERROR] ${error.message}`);
      throw error;
    }
  }
};
