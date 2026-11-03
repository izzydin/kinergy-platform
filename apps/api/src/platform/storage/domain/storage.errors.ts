/**
 * Storage Domain Error Hierarchy
 * Translates low-level adapter exceptions into structured domain errors.
 */

export class StorageError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'STORAGE_ERROR',
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

export class StorageFileNotFoundError extends StorageError {
  constructor(key: string, tenantId: string) {
    super(`Storage object '${key}' was not found for tenant '${tenantId}'`, 'FILE_NOT_FOUND', {
      key,
      tenantId,
    });
    this.name = 'StorageFileNotFoundError';
  }
}

export class StorageFileTooLargeError extends StorageError {
  constructor(actualBytes: number, maxBytes: number) {
    super(
      `File size (${(actualBytes / 1024 / 1024).toFixed(2)} MB) exceeds maximum allowed size (${(maxBytes / 1024 / 1024).toFixed(2)} MB)`,
      'FILE_TOO_LARGE',
      { actualBytes, maxBytes },
    );
    this.name = 'StorageFileTooLargeError';
  }
}

export class StorageInvalidMimeTypeError extends StorageError {
  constructor(actualMimeType: string, allowedMimeTypes: string[]) {
    super(
      `MIME type '${actualMimeType}' is not supported. Allowed formats: ${allowedMimeTypes.join(', ')}`,
      'INVALID_MIME_TYPE',
      { actualMimeType, allowedMimeTypes },
    );
    this.name = 'StorageInvalidMimeTypeError';
  }
}

export class StorageTenantAccessDeniedError extends StorageError {
  constructor(key: string, requestingTenantId: string) {
    super(
      `Cross-tenant access violation: Tenant '${requestingTenantId}' is not authorized to access object '${key}'`,
      'TENANT_ACCESS_DENIED',
      { key, requestingTenantId },
    );
    this.name = 'StorageTenantAccessDeniedError';
  }
}

export class StorageQuotaExceededError extends StorageError {
  constructor(tenantId: string, usedBytes: number, maxBytes: number) {
    super(
      `Tenant '${tenantId}' has exceeded maximum storage allowance (${(usedBytes / 1024 / 1024).toFixed(2)} MB of ${(maxBytes / 1024 / 1024).toFixed(2)} MB utilized)`,
      'QUOTA_EXCEEDED',
      { tenantId, usedBytes, maxBytes },
    );
    this.name = 'StorageQuotaExceededError';
  }
}

export class StorageConfigurationError extends StorageError {
  constructor(missingParam: string) {
    super(
      `Storage configuration error: Missing required parameter '${missingParam}' for selected provider`,
      'CONFIGURATION_ERROR',
      { missingParam },
    );
    this.name = 'StorageConfigurationError';
  }
}
