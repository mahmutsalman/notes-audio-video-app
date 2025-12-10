import { app } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { getDatabase } from '../database/database';

export interface BackupResult {
  success: boolean;
  path?: string;
  timestamp?: string;
  error?: string;
  stats?: {
    dbSize: number;
    mediaFiles: number;
    totalSize: number;
  };
}

// Get the backup directory - saves inside app bundle
export function getBackupDir(): string {
  // Use app.getAppPath() which returns the path to the app's main directory
  let appPath = app.getAppPath();

  // If we're in a packaged app (asar), go up to Contents folder
  if (appPath.includes('.asar')) {
    appPath = path.dirname(path.dirname(appPath));
  }

  return path.join(appPath, 'backup');
}

// Get timestamp string for backup folder naming
function getTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

// Recursively copy a directory
async function copyDirectoryRecursive(src: string, dest: string): Promise<{ files: number; size: number }> {
  let totalFiles = 0;
  let totalSize = 0;

  // Create destination directory
  await fs.mkdir(dest, { recursive: true });

  try {
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        const { files, size } = await copyDirectoryRecursive(srcPath, destPath);
        totalFiles += files;
        totalSize += size;
      } else if (entry.isFile()) {
        await fs.copyFile(srcPath, destPath);
        const stat = await fs.stat(srcPath);
        totalFiles += 1;
        totalSize += stat.size;
      }
    }
  } catch (error) {
    // Directory might not exist yet, that's okay
    console.log(`Directory ${src} doesn't exist or is empty, skipping`);
  }

  return { files: totalFiles, size: totalSize };
}

// Main backup function
export async function createBackup(): Promise<BackupResult> {
  const timestamp = getTimestamp();
  const backupDir = getBackupDir();
  const backupPath = path.join(backupDir, timestamp);
  const tempBackupPath = path.join(backupDir, `_temp_${timestamp}`);

  try {
    // Ensure backup directory exists
    await fs.mkdir(backupDir, { recursive: true });

    // Create temp backup folder (for atomic operation)
    await fs.mkdir(tempBackupPath, { recursive: true });

    // Get source paths
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'NotesWithAudioAndVideo.db');
    const dbWalPath = path.join(userDataPath, 'NotesWithAudioAndVideo.db-wal');
    const dbShmPath = path.join(userDataPath, 'NotesWithAudioAndVideo.db-shm');
    const mediaPath = path.join(userDataPath, 'media');

    let dbSize = 0;
    let mediaStats = { files: 0, size: 0 };

    // Checkpoint the WAL to ensure all data is written to the main database file
    try {
      const db = getDatabase();
      db.pragma('wal_checkpoint(TRUNCATE)');
      console.log('WAL checkpoint completed');
    } catch (error) {
      console.log('WAL checkpoint skipped (database might not be using WAL):', error);
    }

    // Copy database file
    if (existsSync(dbPath)) {
      const destDbPath = path.join(tempBackupPath, 'NotesWithAudioAndVideo.db');
      await fs.copyFile(dbPath, destDbPath);
      const stat = await fs.stat(dbPath);
      dbSize = stat.size;
      console.log('Database copied:', destDbPath);
    } else {
      throw new Error('Database file not found');
    }

    // Copy WAL file if exists (might still have some data)
    if (existsSync(dbWalPath)) {
      const destWalPath = path.join(tempBackupPath, 'NotesWithAudioAndVideo.db-wal');
      await fs.copyFile(dbWalPath, destWalPath);
      const stat = await fs.stat(dbWalPath);
      dbSize += stat.size;
      console.log('WAL file copied:', destWalPath);
    }

    // Copy SHM file if exists
    if (existsSync(dbShmPath)) {
      const destShmPath = path.join(tempBackupPath, 'NotesWithAudioAndVideo.db-shm');
      await fs.copyFile(dbShmPath, destShmPath);
      console.log('SHM file copied:', destShmPath);
    }

    // Copy media directory recursively
    if (existsSync(mediaPath)) {
      const destMediaPath = path.join(tempBackupPath, 'media');
      mediaStats = await copyDirectoryRecursive(mediaPath, destMediaPath);
      console.log(`Media copied: ${mediaStats.files} files, ${mediaStats.size} bytes`);
    }

    // Rename temp folder to final name (atomic operation)
    await fs.rename(tempBackupPath, backupPath);
    console.log('Backup completed:', backupPath);

    return {
      success: true,
      path: backupPath,
      timestamp,
      stats: {
        dbSize,
        mediaFiles: mediaStats.files,
        totalSize: dbSize + mediaStats.size,
      },
    };

  } catch (error) {
    // Clean up temp folder on error
    try {
      await fs.rm(tempBackupPath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Backup failed:', errorMessage);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

// List existing backups
export async function listBackups(): Promise<string[]> {
  const backupDir = getBackupDir();

  try {
    const entries = await fs.readdir(backupDir, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('_temp_'))
      .map(entry => entry.name)
      .sort()
      .reverse(); // Most recent first
  } catch {
    return [];
  }
}
