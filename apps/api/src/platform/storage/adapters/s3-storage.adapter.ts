import { Readable } from 'stream';
import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ObjectStoragePort } from '../ports/object-storage.port';
import {
  PresignedDownloadResult,
  PresignedUploadResult,
  StorageDomainFolder,
  StoredObjectMetadata,
} from '../domain/storage.types';
import {
  StorageConfigurationError,
  StorageError,
  StorageFileNotFoundError,
} from '../domain/storage.errors';
import { StorageKeyUtil } from '../utils/storage-key.util';
import { StorageConfiguration } from '../config/storage.config';

@Injectable()
export class S3StorageAdapter implements ObjectStoragePort {
  private readonly logger = new Logger(S3StorageAdapter.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly expirationSeconds: number;

  constructor(config: StorageConfiguration) {
    if (!config.s3Bucket) {
      throw new StorageConfigurationError('STORAGE_S3_BUCKET');
    }

    this.bucket = config.s3Bucket;
    this.expirationSeconds = config.signedUrlExpirationSeconds;

    const credentials =
      config.s3AccessKeyId && config.s3SecretAccessKey
        ? {
            accessKeyId: config.s3AccessKeyId,
            secretAccessKey: config.s3SecretAccessKey,
          }
        : undefined;

    this.s3Client = new S3Client({
      region: config.s3Region || 'auto',
      endpoint: config.s3Endpoint || undefined,
      forcePathStyle: config.s3ForcePathStyle,
      credentials,
    });

    this.logger.log(
      `[S3StorageAdapter] Initialized with bucket '${this.bucket}' (endpoint: ${config.s3Endpoint || 'AWS default'}, region: ${config.s3Region})`,
    );
  }

  async upload(
    tenantId: string,
    domainFolder: StorageDomainFolder,
    filename: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<StoredObjectMetadata> {
    const key = StorageKeyUtil.generateObjectKey(tenantId, domainFolder, filename);

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        Metadata: {
          tenantId,
          domainFolder,
          originalFilename: StorageKeyUtil.sanitizeFilename(filename),
        },
      });

      const response = await this.s3Client.send(command);
      const now = new Date();

      return {
        key,
        tenantId,
        domainFolder,
        filename: StorageKeyUtil.sanitizeFilename(filename),
        mimeType,
        sizeBytes: buffer.length,
        etag: response.ETag?.replace(/"/g, ''),
        createdAt: now,
        lastModified: now,
      };
    } catch (err: unknown) {
      this.handleS3Error(err, key, tenantId);
    }
  }

  async download(
    tenantId: string,
    key: string,
  ): Promise<{ data: Buffer; metadata: StoredObjectMetadata }> {
    StorageKeyUtil.assertTenantOwnsKey(tenantId, key);

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.s3Client.send(command);
      const data = await this.streamToBuffer(response.Body as Readable);
      const metadata = await this.getMetadata(tenantId, key);

      return { data, metadata };
    } catch (err: unknown) {
      this.handleS3Error(err, key, tenantId);
    }
  }

  async delete(tenantId: string, key: string): Promise<void> {
    StorageKeyUtil.assertTenantOwnsKey(tenantId, key);

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.s3Client.send(command);
      this.logger.debug(`[S3StorageAdapter] Deleted object '${key}' from bucket '${this.bucket}'`);
    } catch (err: unknown) {
      this.handleS3Error(err, key, tenantId);
    }
  }

  async exists(tenantId: string, key: string): Promise<boolean> {
    StorageKeyUtil.assertTenantOwnsKey(tenantId, key);

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.s3Client.send(command);
      return true;
    } catch (err: unknown) {
      if (this.isNotFoundException(err)) {
        return false;
      }
      this.handleS3Error(err, key, tenantId);
    }
  }

  async getMetadata(tenantId: string, key: string): Promise<StoredObjectMetadata> {
    StorageKeyUtil.assertTenantOwnsKey(tenantId, key);

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.s3Client.send(command);
      const domainFolder = StorageKeyUtil.extractDomainFolder(key);

      return {
        key,
        tenantId,
        domainFolder,
        filename: response.Metadata?.originalfilename || 'attachment',
        mimeType: response.ContentType || 'application/octet-stream',
        sizeBytes: response.ContentLength || 0,
        etag: response.ETag?.replace(/"/g, ''),
        createdAt: response.LastModified || new Date(),
        lastModified: response.LastModified || new Date(),
      };
    } catch (err: unknown) {
      this.handleS3Error(err, key, tenantId);
    }
  }

  async createPresignedDownloadUrl(
    tenantId: string,
    key: string,
    expiresInSeconds: number = this.expirationSeconds,
  ): Promise<PresignedDownloadResult> {
    StorageKeyUtil.assertTenantOwnsKey(tenantId, key);

    // Verify object existence before issuing signed download token
    const objectExists = await this.exists(tenantId, key);
    if (!objectExists) {
      throw new StorageFileNotFoundError(key, tenantId);
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const downloadUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: expiresInSeconds,
      });

      return {
        downloadUrl,
        key,
        expiresInSeconds,
      };
    } catch (err: unknown) {
      this.handleS3Error(err, key, tenantId);
    }
  }

  async createPresignedUploadUrl(
    tenantId: string,
    domainFolder: StorageDomainFolder,
    filename: string,
    mimeType: string,
    expiresInSeconds: number = this.expirationSeconds,
  ): Promise<PresignedUploadResult> {
    const key = StorageKeyUtil.generateObjectKey(tenantId, domainFolder, filename);

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: mimeType,
        Metadata: {
          tenantId,
          domainFolder,
          originalFilename: StorageKeyUtil.sanitizeFilename(filename),
        },
      });

      const uploadUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: expiresInSeconds,
      });

      return {
        uploadUrl,
        key,
        method: 'PUT',
        requiredHeaders: {
          'Content-Type': mimeType,
        },
        expiresInSeconds,
      };
    } catch (err: unknown) {
      this.handleS3Error(err, key, tenantId);
    }
  }

  private isNotFoundException(err: unknown): boolean {
    if (!err || typeof err !== 'object') {
      return false;
    }
    const error = err as {
      name?: string;
      message?: string;
      $metadata?: { httpStatusCode?: number };
    };

    return (
      error.name === 'NotFound' ||
      error.name === 'NoSuchKey' ||
      error.$metadata?.httpStatusCode === 404 ||
      error.message === 'NoSuchKey' ||
      error.message === 'NotFound'
    );
  }

  private handleS3Error(err: unknown, key: string, tenantId: string): never {
    if (this.isNotFoundException(err)) {
      throw new StorageFileNotFoundError(key, tenantId);
    }

    const message = err instanceof Error ? err.message : String(err);
    this.logger.error(`[S3StorageAdapter] Storage operation error: ${message}`);
    throw new StorageError(`S3 Storage error: ${message}`, 'S3_OPERATION_FAILED', {
      key,
      tenantId,
    });
  }

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk) =>
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
      );
      stream.on('error', (err) => reject(err));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }
}
