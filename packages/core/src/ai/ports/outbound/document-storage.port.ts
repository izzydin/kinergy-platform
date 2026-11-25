export interface StoredDocumentData {
  readonly data: Uint8Array;
  readonly mimeType?: string;
  readonly sizeBytes?: number;
}

/**
 * Outbound port for resolving and reading binary document objects from storage.
 * Follows Hexagonal Architecture, decoupling the domain from specific storage implementations.
 */
export interface IDocumentStoragePort {
  /**
   * Check if an object exists in storage for the tenant.
   */
  exists(tenantId: string, storageKey: string): Promise<boolean>;

  /**
   * Download the object data from storage.
   */
  download(tenantId: string, storageKey: string): Promise<StoredDocumentData>;
}
