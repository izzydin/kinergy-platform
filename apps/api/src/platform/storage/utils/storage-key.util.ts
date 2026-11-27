import * as crypto from 'crypto';
import * as path from 'path';
import { StorageDomainFolder } from '../domain/storage.types';
import { StorageTenantAccessDeniedError } from '../domain/storage.errors';

export class StorageKeyUtil {
  /**
   * Sanitizes a user-supplied filename to prevent path traversal and shell injection.
   */
  static sanitizeFilename(filename: string): string {
    const normalized = filename.replace(/\\/g, '/');
    const basename = path.posix.basename(normalized);
    const cleaned = basename
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.{2,}/g, '.')
      .replace(/^\.+/, '')
      .replace(/\.+$/, '')
      .replace(/^_+/, '')
      .replace(/_+$/, '');

    return cleaned || 'attachment';
  }

  /**
   * Generates a deterministic, partition-safe, and collision-resistant storage key.
   * Pattern: tenants/{tenantId}/{domainFolder}/{year}/{month}/{uniqueId}-{sanitizedFilename}
   */
  static generateObjectKey(
    tenantId: string,
    domainFolder: StorageDomainFolder,
    filename: string,
    now: Date = new Date(),
  ): string {
    if (!tenantId || !/^[a-zA-Z0-9_-]+$/.test(tenantId)) {
      throw new StorageTenantAccessDeniedError('invalid-tenant', tenantId || 'undefined');
    }
    const sanitized = this.sanitizeFilename(filename);
    const uniqueId = crypto.randomUUID().slice(0, 12);
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');

    return `tenants/${tenantId}/${domainFolder}/${year}/${month}/${uniqueId}-${sanitized}`;
  }

  /**
   * Generates a fully opaque internal storage key with purely synthetic UUID identifiers.
   * Completely uncouples storage paths from client filenames, eliminating filename injection and leakage.
   * Pattern: tenants/{tenantId}/{domainFolder}/{year}/{month}/{uuid}.{ext}
   */
  static generateOpaqueObjectKey(
    tenantId: string,
    domainFolder: StorageDomainFolder,
    extension: string,
    now: Date = new Date(),
  ): string {
    if (!tenantId || !/^[a-zA-Z0-9_-]+$/.test(tenantId)) {
      throw new StorageTenantAccessDeniedError('invalid-tenant', tenantId || 'undefined');
    }
    const safeExt =
      extension
        .replace(/^\.+/, '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toLowerCase() || 'bin';
    const uuid = crypto.randomUUID();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');

    return `tenants/${tenantId}/${domainFolder}/${year}/${month}/${uuid}.${safeExt}`;
  }

  /**
   * Strictly asserts that an object key belongs to the requesting tenant.
   * Defends against cross-tenant access attacks, path traversal, null-byte injection, and key guessing.
   */
  static assertTenantOwnsKey(tenantId: string, key: string): void {
    if (!tenantId || !key) {
      throw new StorageTenantAccessDeniedError(key || 'undefined', tenantId || 'undefined');
    }

    // Strict tenant identifier assertion (prevents tenantId traversal/manipulation)
    if (!/^[a-zA-Z0-9_-]+$/.test(tenantId)) {
      throw new StorageTenantAccessDeniedError(key, tenantId);
    }

    // Null-byte and unprintable control character rejection
    // eslint-disable-next-line no-control-regex
    if (key.includes('\0') || /[\x00-\x1f\x7f]/.test(key)) {
      throw new StorageTenantAccessDeniedError(key, tenantId);
    }

    // Decode URL-encoded components to catch %2e%2e%2f traversal
    let decodedKey: string;
    try {
      decodedKey = decodeURIComponent(key);
    } catch {
      throw new StorageTenantAccessDeniedError(key, tenantId);
    }

    // Normalized path check to prevent ../ or ..\\ traversal attacks
    const normalizedKey = path.posix.normalize(decodedKey.replace(/\\/g, '/'));
    if (
      normalizedKey.startsWith('../') ||
      normalizedKey.includes('/../') ||
      normalizedKey.includes('/..') ||
      normalizedKey.startsWith('/')
    ) {
      throw new StorageTenantAccessDeniedError(key, tenantId);
    }

    const expectedPrefix = `tenants/${tenantId}/`;
    if (!normalizedKey.startsWith(expectedPrefix)) {
      throw new StorageTenantAccessDeniedError(key, tenantId);
    }
  }

  /**
   * Extracts domain folder from a valid tenant object key.
   */
  static extractDomainFolder(key: string): StorageDomainFolder {
    const parts = key.split('/');
    // Format: tenants/{tenantId}/{domainFolder}/...
    const folder = parts[2] as StorageDomainFolder;
    return folder || 'clinical';
  }
}
