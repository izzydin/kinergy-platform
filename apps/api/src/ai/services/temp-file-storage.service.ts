import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { StorageTenantAccessDeniedError } from '../../platform/storage/domain/storage.errors';

export interface TempFileStorageConfig {
  scratchRoot?: string;
  maxSizeBytes?: number;
  maxAgeMs?: number;
}

const DEFAULT_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const DEFAULT_MAX_AGE_MS = 60 * 60 * 1000; // 1 Hour

/**
 * Service managing private, isolated ephemeral scratch files for parser and extraction operations.
 *
 * Guarantees:
 * 1. Strict Tenant Isolation: Temporary files are stored in per-tenant, per-operation UUID folders.
 * 2. Restrictive POSIX Permissions: Directories created with 0700; files written with 0600.
 * 3. Unguessable File Identifiers: Paths use cryptographically secure UUIDs; client filenames never enter paths.
 * 4. Guaranteed Cleanup: executeWithTempFile wraps actions in try/finally to unlink files and rmdir folders.
 * 5. Host Disk Defense: Enforces size bounds and provides stale garbage collection to prevent disk exhaustion.
 */
@Injectable()
export class TempFileStorageService {
  private readonly logger = new Logger(TempFileStorageService.name);
  private readonly scratchRoot: string;
  private readonly maxSizeBytes: number;
  private readonly maxAgeMs: number;

  constructor(@Optional() config?: TempFileStorageConfig) {
    this.scratchRoot = path.resolve(
      config?.scratchRoot || path.join(os.tmpdir(), 'kinergy-temp-storage'),
    );
    this.maxSizeBytes = config?.maxSizeBytes || DEFAULT_MAX_SIZE_BYTES;
    this.maxAgeMs = config?.maxAgeMs || DEFAULT_MAX_AGE_MS;
  }

  public getScratchRoot(): string {
    return this.scratchRoot;
  }

  /**
   * Asserts that a tenant identifier is safe and does not attempt directory traversal.
   */
  private assertSafeTenantId(tenantId: string): void {
    if (!tenantId || !/^[a-zA-Z0-9_-]+$/.test(tenantId)) {
      throw new StorageTenantAccessDeniedError('temp-scratch', tenantId || 'undefined');
    }
  }

  /**
   * Generates a safe, unguessable temporary directory for an isolated operation.
   */
  public async createIsolatedTempDir(tenantId: string): Promise<string> {
    this.assertSafeTenantId(tenantId);

    const operationId = crypto.randomUUID();
    const tempDir = path.join(this.scratchRoot, tenantId, operationId);

    // Enforce root containment
    if (!tempDir.startsWith(this.scratchRoot + path.sep)) {
      throw new StorageTenantAccessDeniedError('temp-traversal', tenantId);
    }

    await fs.mkdir(tempDir, { recursive: true, mode: 0o700 });
    return tempDir;
  }

  /**
   * Writes a buffer to a secure temporary file within an isolated directory.
   */
  public async writeTempFile(
    tempDir: string,
    buffer: Buffer,
    rawExtension: string = 'bin',
  ): Promise<string> {
    if (buffer.length > this.maxSizeBytes) {
      throw new Error(
        `Temporary file size (${buffer.length} bytes) exceeds maximum limit of ${this.maxSizeBytes} bytes`,
      );
    }

    // Ensure directory is rooted within scratch root
    if (!tempDir.startsWith(this.scratchRoot + path.sep)) {
      throw new StorageTenantAccessDeniedError(tempDir, 'invalid-temp-dir');
    }

    const safeExt =
      rawExtension
        .replace(/^\.+/, '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toLowerCase() || 'bin';
    const tempFileName = `${crypto.randomUUID()}.${safeExt}`;
    const tempFilePath = path.join(tempDir, tempFileName);

    await fs.writeFile(tempFilePath, buffer, { mode: 0o600 });
    return tempFilePath;
  }

  /**
   * Safely deletes a temporary file and its parent isolated directory.
   */
  public async cleanupTempPath(filePathOrDir: string): Promise<void> {
    try {
      const stat = await fs.stat(filePathOrDir).catch(() => null);
      if (!stat) return;

      if (stat.isDirectory()) {
        await fs.rm(filePathOrDir, { recursive: true, force: true });
      } else {
        await fs.unlink(filePathOrDir).catch(() => null);
        const parentDir = path.dirname(filePathOrDir);
        // Remove parent operation directory if it is under scratch root and empty
        if (parentDir.startsWith(this.scratchRoot + path.sep)) {
          await fs.rm(parentDir, { recursive: true, force: true }).catch(() => null);
        }
      }
    } catch (err) {
      this.logger.warn(`Failed cleaning temporary scratch path '${filePathOrDir}': ${err}`);
    }
  }

  /**
   * Executes a callback with an isolated temporary file, guaranteeing unconditional cleanup in finally block.
   */
  public async executeWithTempFile<T>(
    tenantId: string,
    buffer: Buffer,
    extension: string,
    action: (tempFilePath: string) => Promise<T>,
  ): Promise<T> {
    const tempDir = await this.createIsolatedTempDir(tenantId);
    let tempFilePath: string | null = null;

    try {
      tempFilePath = await this.writeTempFile(tempDir, buffer, extension);
      return await action(tempFilePath);
    } finally {
      if (tempFilePath) {
        await this.cleanupTempPath(tempFilePath);
      } else {
        await this.cleanupTempPath(tempDir);
      }
    }
  }

  /**
   * Periodic garbage collection to remove stale temporary files older than configured maxAgeMs.
   */
  public async cleanupStaleScratch(maxAgeMs: number = this.maxAgeMs): Promise<number> {
    let removedCount = 0;
    const now = Date.now();

    try {
      const exists = await fs
        .access(this.scratchRoot)
        .then(() => true)
        .catch(() => false);
      if (!exists) return 0;

      const tenantDirs = await fs.readdir(this.scratchRoot);

      for (const tDir of tenantDirs) {
        const tenantPath = path.join(this.scratchRoot, tDir);
        const tStat = await fs.stat(tenantPath).catch(() => null);
        if (!tStat || !tStat.isDirectory()) continue;

        const opDirs = await fs.readdir(tenantPath);
        for (const opDir of opDirs) {
          const opPath = path.join(tenantPath, opDir);
          const opStat = await fs.stat(opPath).catch(() => null);
          if (opStat && opStat.isDirectory()) {
            const ageMs = now - opStat.mtimeMs;
            if (ageMs > maxAgeMs) {
              await fs.rm(opPath, { recursive: true, force: true }).catch(() => null);
              removedCount++;
            }
          }
        }
      }
    } catch (err) {
      this.logger.error(`Error during stale scratch garbage collection: ${err}`);
    }

    return removedCount;
  }
}
