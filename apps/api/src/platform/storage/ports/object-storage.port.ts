import {
  PresignedDownloadResult,
  PresignedUploadResult,
  StorageDomainFolder,
  StoredObjectMetadata,
} from '../domain/storage.types';

export const OBJECT_STORAGE_PORT = Symbol('OBJECT_STORAGE_PORT');

export interface ObjectStoragePort {
  /**
   * Uploads an object buffer to the backing store with tenant partition validation.
   */
  upload(
    tenantId: string,
    domainFolder: StorageDomainFolder,
    filename: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<StoredObjectMetadata>;

  /**
   * Downloads an object buffer from the store, verifying tenant ownership.
   */
  download(
    tenantId: string,
    key: string,
  ): Promise<{ data: Buffer; metadata: StoredObjectMetadata }>;

  /**
   * Deletes an object from the store, verifying tenant ownership.
   */
  delete(tenantId: string, key: string): Promise<void>;

  /**
   * Checks whether an object exists within the tenant partition.
   */
  exists(tenantId: string, key: string): Promise<boolean>;

  /**
   * Retrieves metadata for an object without loading its content payload.
   */
  getMetadata(tenantId: string, key: string): Promise<StoredObjectMetadata>;

  /**
   * Creates a short-lived pre-signed download URL (default 15 minutes TTL).
   */
  createPresignedDownloadUrl(
    tenantId: string,
    key: string,
    expiresInSeconds?: number,
  ): Promise<PresignedDownloadResult>;

  /**
   * Creates a short-lived pre-signed upload URL (default 15 minutes TTL).
   */
  createPresignedUploadUrl(
    tenantId: string,
    domainFolder: StorageDomainFolder,
    filename: string,
    mimeType: string,
    expiresInSeconds?: number,
  ): Promise<PresignedUploadResult>;
}
