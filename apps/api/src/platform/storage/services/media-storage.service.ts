import { Inject, Injectable } from '@nestjs/common';
import { OBJECT_STORAGE_PORT, ObjectStoragePort } from '../ports/object-storage.port';
import {
  PresignedDownloadResult,
  PresignedUploadResult,
  StorageDomainFolder,
  StorageQuotaInfo,
  StoredObjectMetadata,
} from '../domain/storage.types';
import {
  StorageFileTooLargeError,
  StorageInvalidMimeTypeError,
  StorageQuotaExceededError,
  StorageTenantAccessDeniedError,
} from '../domain/storage.errors';
import { StorageConfiguration } from '../config/storage.config';

@Injectable()
export class MediaStorageService {
  private readonly tenantUsageBytes = new Map<string, number>();

  constructor(
    @Inject(OBJECT_STORAGE_PORT)
    private readonly storagePort: ObjectStoragePort,
    @Inject('STORAGE_CONFIGURATION')
    private readonly config: StorageConfiguration,
  ) {}

  /**
   * Uploads a validated file buffer to external storage.
   */
  async uploadFile(
    tenantId: string,
    domainFolder: StorageDomainFolder,
    filename: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<StoredObjectMetadata> {
    this.validateTenantId(tenantId);
    this.validateFileSize(buffer.length);
    this.validateMimeType(mimeType);
    this.validateTenantQuota(tenantId, buffer.length);

    const metadata = await this.storagePort.upload(
      tenantId,
      domainFolder,
      filename,
      buffer,
      mimeType,
    );

    // Track tenant storage quota for cost-control safeguards
    const current = this.tenantUsageBytes.get(tenantId) || 0;
    this.tenantUsageBytes.set(tenantId, current + buffer.length);

    return metadata;
  }

  /**
   * Downloads and returns a file buffer, asserting tenant ownership.
   */
  async getFile(
    tenantId: string,
    key: string,
  ): Promise<{ data: Buffer; metadata: StoredObjectMetadata }> {
    this.validateTenantId(tenantId);
    return this.storagePort.download(tenantId, key);
  }

  /**
   * Issues a short-lived pre-signed URL for direct browser uploads.
   * Validates planned size and MIME type before issuing bearer token.
   */
  async requestPresignedUpload(
    tenantId: string,
    domainFolder: StorageDomainFolder,
    filename: string,
    mimeType: string,
    estimatedSizeBytes: number,
  ): Promise<PresignedUploadResult> {
    this.validateTenantId(tenantId);
    this.validateFileSize(estimatedSizeBytes);
    this.validateMimeType(mimeType);
    this.validateTenantQuota(tenantId, estimatedSizeBytes);

    return this.storagePort.createPresignedUploadUrl(
      tenantId,
      domainFolder,
      filename,
      mimeType,
      this.config.signedUrlExpirationSeconds,
    );
  }

  /**
   * Issues a short-lived pre-signed URL for browser downloads, asserting tenant ownership.
   */
  async requestPresignedDownload(tenantId: string, key: string): Promise<PresignedDownloadResult> {
    this.validateTenantId(tenantId);
    return this.storagePort.createPresignedDownloadUrl(
      tenantId,
      key,
      this.config.signedUrlExpirationSeconds,
    );
  }

  /**
   * Deletes a file from storage and decrements tenant quota tracking.
   */
  async deleteFile(tenantId: string, key: string): Promise<void> {
    this.validateTenantId(tenantId);
    const metadata = await this.storagePort.getMetadata(tenantId, key);
    await this.storagePort.delete(tenantId, key);

    const current = this.tenantUsageBytes.get(tenantId) || 0;
    const updated = Math.max(0, current - metadata.sizeBytes);
    this.tenantUsageBytes.set(tenantId, updated);
  }

  /**
   * Retrieves storage quota status for a tenant (cost control safeguard).
   */
  getTenantQuotaStatus(tenantId: string): StorageQuotaInfo {
    this.validateTenantId(tenantId);
    const usedBytes = this.tenantUsageBytes.get(tenantId) || 0;
    const maxBytes = this.config.tenantQuotaBytes;
    const remainingBytes = Math.max(0, maxBytes - usedBytes);

    return {
      tenantId,
      usedBytes,
      maxBytes,
      remainingBytes,
    };
  }

  private validateTenantId(tenantId: string): void {
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '') {
      throw new StorageTenantAccessDeniedError('unknown', 'missing-tenant');
    }
  }

  private validateFileSize(sizeBytes: number): void {
    if (sizeBytes > this.config.maxFileSizeBytes) {
      throw new StorageFileTooLargeError(sizeBytes, this.config.maxFileSizeBytes);
    }
  }

  private validateMimeType(mimeType: string): void {
    const normalized = mimeType.toLowerCase().trim();
    if (!this.config.allowedMimeTypes.includes(normalized)) {
      throw new StorageInvalidMimeTypeError(normalized, this.config.allowedMimeTypes);
    }
  }

  private validateTenantQuota(tenantId: string, incomingBytes: number): void {
    const currentUsed = this.tenantUsageBytes.get(tenantId) || 0;
    if (currentUsed + incomingBytes > this.config.tenantQuotaBytes) {
      throw new StorageQuotaExceededError(
        tenantId,
        currentUsed + incomingBytes,
        this.config.tenantQuotaBytes,
      );
    }
  }
}
