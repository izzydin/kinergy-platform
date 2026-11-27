import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ObjectStoragePort } from '../ports/object-storage.port';
import {
  PresignedDownloadResult,
  PresignedUploadResult,
  StorageDomainFolder,
  StoredObjectMetadata,
} from '../domain/storage.types';
import { StorageFileNotFoundError, StorageTenantAccessDeniedError } from '../domain/storage.errors';
import { StorageKeyUtil } from '../utils/storage-key.util';
import { StorageConfiguration } from '../config/storage.config';

@Injectable()
export class LocalStorageAdapter implements ObjectStoragePort {
  private readonly logger = new Logger(LocalStorageAdapter.name);
  private readonly rootDir: string;
  private readonly expirationSeconds: number;

  constructor(config: StorageConfiguration) {
    this.rootDir = path.resolve(config.localRoot);
    this.expirationSeconds = config.signedUrlExpirationSeconds;
  }

  private getFilePath(key: string): string {
    const safeKey = path.posix.normalize(key.replace(/\\/g, '/'));
    const resolvedPath = path.resolve(this.rootDir, safeKey);
    const resolvedRoot = path.resolve(this.rootDir);
    if (!resolvedPath.startsWith(resolvedRoot + path.sep) && resolvedPath !== resolvedRoot) {
      throw new StorageTenantAccessDeniedError(key, 'traversal-detected');
    }
    return resolvedPath;
  }

  private getMetaFilePath(key: string): string {
    return `${this.getFilePath(key)}.meta.json`;
  }

  async upload(
    tenantId: string,
    domainFolder: StorageDomainFolder,
    filename: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<StoredObjectMetadata> {
    const key = StorageKeyUtil.generateObjectKey(tenantId, domainFolder, filename);
    const filePath = this.getFilePath(key);
    const metaFilePath = this.getMetaFilePath(key);

    await fs.mkdir(path.dirname(filePath), { recursive: true });

    const etag = crypto.createHash('md5').update(buffer).digest('hex');
    const now = new Date();

    const metadata: StoredObjectMetadata = {
      key,
      tenantId,
      domainFolder,
      filename: StorageKeyUtil.sanitizeFilename(filename),
      mimeType,
      sizeBytes: buffer.length,
      etag,
      createdAt: now,
      lastModified: now,
    };

    await fs.writeFile(filePath, buffer);
    await fs.writeFile(metaFilePath, JSON.stringify(metadata, null, 2), 'utf-8');

    this.logger.debug(`[LocalStorage] Stored file '${key}' (${buffer.length} bytes)`);
    return metadata;
  }

  async download(
    tenantId: string,
    key: string,
  ): Promise<{ data: Buffer; metadata: StoredObjectMetadata }> {
    StorageKeyUtil.assertTenantOwnsKey(tenantId, key);
    const filePath = this.getFilePath(key);

    try {
      const data = await fs.readFile(filePath);
      const metadata = await this.getMetadata(tenantId, key);
      return { data, metadata };
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new StorageFileNotFoundError(key, tenantId);
      }
      throw err;
    }
  }

  async delete(tenantId: string, key: string): Promise<void> {
    StorageKeyUtil.assertTenantOwnsKey(tenantId, key);
    const filePath = this.getFilePath(key);
    const metaFilePath = this.getMetaFilePath(key);

    try {
      await fs.unlink(filePath);
      await fs.unlink(metaFilePath).catch(() => undefined);
      this.logger.debug(`[LocalStorage] Deleted file '${key}'`);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new StorageFileNotFoundError(key, tenantId);
      }
      throw err;
    }
  }

  async exists(tenantId: string, key: string): Promise<boolean> {
    StorageKeyUtil.assertTenantOwnsKey(tenantId, key);
    const filePath = this.getFilePath(key);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async getMetadata(tenantId: string, key: string): Promise<StoredObjectMetadata> {
    StorageKeyUtil.assertTenantOwnsKey(tenantId, key);
    const metaFilePath = this.getMetaFilePath(key);

    try {
      const metaContent = await fs.readFile(metaFilePath, 'utf-8');
      const parsed = JSON.parse(metaContent) as StoredObjectMetadata;
      return {
        ...parsed,
        createdAt: new Date(parsed.createdAt),
        lastModified: new Date(parsed.lastModified),
      };
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new StorageFileNotFoundError(key, tenantId);
      }
      throw err;
    }
  }

  async createPresignedDownloadUrl(
    tenantId: string,
    key: string,
    expiresInSeconds: number = this.expirationSeconds,
  ): Promise<PresignedDownloadResult> {
    StorageKeyUtil.assertTenantOwnsKey(tenantId, key);
    // Verify file exists before issuing download token
    const fileExists = await this.exists(tenantId, key);
    if (!fileExists) {
      throw new StorageFileNotFoundError(key, tenantId);
    }

    // In local mode, generate a local gateway path with HMAC signature and expiration
    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const secret =
      process.env['STORAGE_LOCAL_SECRET'] ||
      process.env['JWT_SECRET'] ||
      'local-storage-secret-key-salt-2026';
    const token = crypto
      .createHmac('sha256', secret)
      .update(`${tenantId}:${key}:${expiresAt}`)
      .digest('hex');

    const downloadUrl = `/api/v1/storage/local/${encodeURIComponent(key)}?token=${token}&expiresAt=${expiresAt}`;

    return {
      downloadUrl,
      key,
      expiresInSeconds,
    };
  }

  async createPresignedUploadUrl(
    tenantId: string,
    domainFolder: StorageDomainFolder,
    filename: string,
    mimeType: string,
    expiresInSeconds: number = this.expirationSeconds,
  ): Promise<PresignedUploadResult> {
    const key = StorageKeyUtil.generateObjectKey(tenantId, domainFolder, filename);

    const token = crypto
      .createHmac('sha256', 'local-storage-secret')
      .update(`${tenantId}:${key}:${expiresInSeconds}:${mimeType}`)
      .digest('hex');

    const uploadUrl = `/api/v1/storage/local/${encodeURIComponent(key)}?token=${token}`;

    return {
      uploadUrl,
      key,
      method: 'PUT',
      requiredHeaders: {
        'Content-Type': mimeType,
      },
      expiresInSeconds,
    };
  }
}
