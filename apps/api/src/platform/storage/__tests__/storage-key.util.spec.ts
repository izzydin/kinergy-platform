import { StorageKeyUtil } from '../utils/storage-key.util';
import { StorageTenantAccessDeniedError } from '../domain/storage.errors';

describe('StorageKeyUtil (Unit)', () => {
  describe('sanitizeFilename', () => {
    it('removes path traversal sequences and dangerous characters', () => {
      expect(StorageKeyUtil.sanitizeFilename('../../etc/passwd')).toBe('passwd');
      expect(StorageKeyUtil.sanitizeFilename('..\\..\\windows\\system32\\cmd.exe')).toBe('cmd.exe');
      expect(StorageKeyUtil.sanitizeFilename('my report (final) #1!.pdf')).toBe(
        'my_report__final___1_.pdf',
      );
    });

    it('returns default fallback when filename is completely stripped', () => {
      expect(StorageKeyUtil.sanitizeFilename('///')).toBe('attachment');
      expect(StorageKeyUtil.sanitizeFilename('....')).toBe('attachment');
      expect(StorageKeyUtil.sanitizeFilename('')).toBe('attachment');
    });

    it('preserves legitimate filenames with dots, hyphens, and underscores', () => {
      expect(StorageKeyUtil.sanitizeFilename('clinical-scan_2026.pdf')).toBe(
        'clinical-scan_2026.pdf',
      );
      expect(StorageKeyUtil.sanitizeFilename('avatar.png')).toBe('avatar.png');
    });
  });

  describe('generateObjectKey', () => {
    it('generates a tenant-partitioned, date-structured key', () => {
      const fixedDate = new Date('2026-11-03T12:00:00Z');
      const key = StorageKeyUtil.generateObjectKey(
        'tenant_alpha',
        'clinical',
        'scan.pdf',
        fixedDate,
      );

      expect(key).toMatch(/^tenants\/tenant_alpha\/clinical\/2026\/11\/[a-f0-9-]+-scan\.pdf$/);
    });
  });

  describe('assertTenantOwnsKey', () => {
    it('succeeds when key belongs to requesting tenant', () => {
      expect(() =>
        StorageKeyUtil.assertTenantOwnsKey(
          'tenant_alpha',
          'tenants/tenant_alpha/clinical/2026/11/abc-scan.pdf',
        ),
      ).not.toThrow();
    });

    it('throws StorageTenantAccessDeniedError on cross-tenant access attempt', () => {
      expect(() =>
        StorageKeyUtil.assertTenantOwnsKey(
          'tenant_beta',
          'tenants/tenant_alpha/clinical/2026/11/abc-scan.pdf',
        ),
      ).toThrow(StorageTenantAccessDeniedError);
    });

    it('throws StorageTenantAccessDeniedError on path traversal attempt', () => {
      expect(() =>
        StorageKeyUtil.assertTenantOwnsKey(
          'tenant_alpha',
          'tenants/tenant_alpha/../tenant_beta/private.pdf',
        ),
      ).toThrow(StorageTenantAccessDeniedError);

      expect(() => StorageKeyUtil.assertTenantOwnsKey('tenant_alpha', '../../etc/passwd')).toThrow(
        StorageTenantAccessDeniedError,
      );
    });

    it('throws StorageTenantAccessDeniedError on missing tenant or key', () => {
      expect(() => StorageKeyUtil.assertTenantOwnsKey('', 'some-key')).toThrow(
        StorageTenantAccessDeniedError,
      );
      expect(() => StorageKeyUtil.assertTenantOwnsKey('tenant_alpha', '')).toThrow(
        StorageTenantAccessDeniedError,
      );
    });
  });

  describe('extractDomainFolder', () => {
    it('extracts folder from standard key', () => {
      const folder = StorageKeyUtil.extractDomainFolder(
        'tenants/tenant_alpha/receipts/2026/11/uuid-rec.pdf',
      );
      expect(folder).toBe('receipts');
    });
  });
});
