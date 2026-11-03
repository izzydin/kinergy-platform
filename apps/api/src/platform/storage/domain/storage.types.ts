/**
 * Storage Domain Types & Value Objects (Milestone 10.5)
 * Platform-level abstractions for external object and media storage.
 */

export type StorageProviderType = 'local' | 's3';

export type StorageDomainFolder = 'clinical' | 'clients' | 'receipts' | 'backups';

export interface StorageFileDescriptor {
  tenantId: string;
  domainFolder: StorageDomainFolder;
  filename: string;
  mimeType: string;
  buffer: Buffer;
  sizeBytes: number;
}

export interface StoredObjectMetadata {
  key: string;
  tenantId: string;
  domainFolder: StorageDomainFolder;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  etag?: string;
  createdAt: Date;
  lastModified: Date;
}

export interface PresignedUploadResult {
  uploadUrl: string;
  key: string;
  method: 'PUT' | 'POST';
  requiredHeaders: Record<string, string>;
  expiresInSeconds: number;
}

export interface PresignedDownloadResult {
  downloadUrl: string;
  key: string;
  expiresInSeconds: number;
}

export interface StorageQuotaInfo {
  tenantId: string;
  usedBytes: number;
  maxBytes: number;
  remainingBytes: number;
}
