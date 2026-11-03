import { MediaStorageService } from '../services/media-storage.service';
import { ObjectStoragePort } from '../ports/object-storage.port';
import { StorageConfiguration } from '../config/storage.config';
import {
  StorageFileTooLargeError,
  StorageInvalidMimeTypeError,
  StorageQuotaExceededError,
  StorageTenantAccessDeniedError,
} from '../domain/storage.errors';

describe('MediaStorageService (Application Security & Quota Governance)', () => {
  let service: MediaStorageService;
  let mockStoragePort: jest.Mocked<ObjectStoragePort>;

  const testConfig: StorageConfiguration = {
    provider: 'local',
    localRoot: './.storage',
    s3Region: 'auto',
    s3Bucket: 'test-bucket',
    s3ForcePathStyle: false,
    maxFileSizeBytes: 10 * 1024 * 1024, // 10 MB limit
    signedUrlExpirationSeconds: 900,
    tenantQuotaBytes: 15 * 1024 * 1024, // 15 MB limit for test quota
    allowedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'],
  };

  beforeEach(() => {
    mockStoragePort = {
      upload: jest.fn(),
      download: jest.fn(),
      delete: jest.fn(),
      exists: jest.fn(),
      getMetadata: jest.fn(),
      createPresignedDownloadUrl: jest.fn(),
      createPresignedUploadUrl: jest.fn(),
    };

    service = new MediaStorageService(mockStoragePort, testConfig);
  });

  describe('Upload & Validation', () => {
    it('uploads valid file and tracks tenant quota', async () => {
      const buffer = Buffer.alloc(2 * 1024 * 1024); // 2 MB
      mockStoragePort.upload.mockResolvedValueOnce({
        key: 'tenants/t1/clinical/2026/11/abc-doc.pdf',
        tenantId: 't1',
        domainFolder: 'clinical',
        filename: 'doc.pdf',
        mimeType: 'application/pdf',
        sizeBytes: buffer.length,
        createdAt: new Date(),
        lastModified: new Date(),
      });

      const result = await service.uploadFile(
        't1',
        'clinical',
        'doc.pdf',
        buffer,
        'application/pdf',
      );

      expect(result.sizeBytes).toBe(buffer.length);
      expect(mockStoragePort.upload).toHaveBeenCalledWith(
        't1',
        'clinical',
        'doc.pdf',
        buffer,
        'application/pdf',
      );

      const quota = service.getTenantQuotaStatus('t1');
      expect(quota.usedBytes).toBe(buffer.length);
      expect(quota.remainingBytes).toBe(testConfig.tenantQuotaBytes - buffer.length);
    });

    it('rejects files exceeding maximum allowed size (10 MB)', async () => {
      const oversizedBuffer = Buffer.alloc(11 * 1024 * 1024); // 11 MB

      await expect(
        service.uploadFile('t1', 'clinical', 'large-scan.pdf', oversizedBuffer, 'application/pdf'),
      ).rejects.toThrow(StorageFileTooLargeError);

      expect(mockStoragePort.upload).not.toHaveBeenCalled();
    });

    it('rejects disallowed or executable MIME types', async () => {
      const buffer = Buffer.from('console.log("malicious");');

      await expect(
        service.uploadFile('t1', 'clinical', 'script.js', buffer, 'application/javascript'),
      ).rejects.toThrow(StorageInvalidMimeTypeError);

      await expect(
        service.uploadFile('t1', 'clinical', 'payload.exe', buffer, 'application/x-msdownload'),
      ).rejects.toThrow(StorageInvalidMimeTypeError);

      expect(mockStoragePort.upload).not.toHaveBeenCalled();
    });

    it('rejects missing or empty tenant ID', async () => {
      const buffer = Buffer.from('data');

      await expect(
        service.uploadFile('', 'clinical', 'doc.pdf', buffer, 'application/pdf'),
      ).rejects.toThrow(StorageTenantAccessDeniedError);

      await expect(service.getFile('  ', 'some-key')).rejects.toThrow(
        StorageTenantAccessDeniedError,
      );
    });
  });

  describe('Tenant Quota Cost Control Safeguards', () => {
    it('enforces tenant quota limit when cumulative storage is exceeded', async () => {
      const file1 = Buffer.alloc(8 * 1024 * 1024); // 8 MB
      const file2 = Buffer.alloc(8 * 1024 * 1024); // 8 MB (Total = 16 MB > 15 MB quota)

      mockStoragePort.upload.mockResolvedValueOnce({
        key: 'k1',
        tenantId: 't1',
        domainFolder: 'clinical',
        filename: 'f1.pdf',
        mimeType: 'application/pdf',
        sizeBytes: file1.length,
        createdAt: new Date(),
        lastModified: new Date(),
      });

      await service.uploadFile('t1', 'clinical', 'f1.pdf', file1, 'application/pdf');

      // Second file exceeds 15 MB quota
      await expect(
        service.uploadFile('t1', 'clinical', 'f2.pdf', file2, 'application/pdf'),
      ).rejects.toThrow(StorageQuotaExceededError);
    });

    it('decrements quota usage when a file is deleted', async () => {
      const file = Buffer.alloc(5 * 1024 * 1024); // 5 MB
      mockStoragePort.upload.mockResolvedValueOnce({
        key: 'k1',
        tenantId: 't1',
        domainFolder: 'clinical',
        filename: 'f1.pdf',
        mimeType: 'application/pdf',
        sizeBytes: file.length,
        createdAt: new Date(),
        lastModified: new Date(),
      });

      await service.uploadFile('t1', 'clinical', 'f1.pdf', file, 'application/pdf');
      expect(service.getTenantQuotaStatus('t1').usedBytes).toBe(5 * 1024 * 1024);

      mockStoragePort.getMetadata.mockResolvedValueOnce({
        key: 'k1',
        tenantId: 't1',
        domainFolder: 'clinical',
        filename: 'f1.pdf',
        mimeType: 'application/pdf',
        sizeBytes: file.length,
        createdAt: new Date(),
        lastModified: new Date(),
      });
      mockStoragePort.delete.mockResolvedValueOnce();

      await service.deleteFile('t1', 'k1');
      expect(service.getTenantQuotaStatus('t1').usedBytes).toBe(0);
    });
  });

  describe('Presigned URLs & Direct Browser Access', () => {
    it('validates planned upload size and MIME type before issuing presigned upload URL', async () => {
      mockStoragePort.createPresignedUploadUrl.mockResolvedValueOnce({
        uploadUrl: 'https://r2.cloudflarestorage.com/signed-upload',
        key: 'tenants/t1/clinical/uuid-file.pdf',
        method: 'PUT',
        requiredHeaders: { 'Content-Type': 'application/pdf' },
        expiresInSeconds: 900,
      });

      const result = await service.requestPresignedUpload(
        't1',
        'clinical',
        'file.pdf',
        'application/pdf',
        2 * 1024 * 1024,
      );

      expect(result.uploadUrl).toBe('https://r2.cloudflarestorage.com/signed-upload');
      expect(mockStoragePort.createPresignedUploadUrl).toHaveBeenCalledWith(
        't1',
        'clinical',
        'file.pdf',
        'application/pdf',
        900,
      );
    });

    it('rejects presigned upload request for oversized planned file', async () => {
      await expect(
        service.requestPresignedUpload(
          't1',
          'clinical',
          'large.pdf',
          'application/pdf',
          12 * 1024 * 1024, // 12 MB > 10 MB
        ),
      ).rejects.toThrow(StorageFileTooLargeError);
    });

    it('issues presigned download URL for tenant-owned file', async () => {
      mockStoragePort.createPresignedDownloadUrl.mockResolvedValueOnce({
        downloadUrl: 'https://r2.cloudflarestorage.com/signed-download',
        key: 'tenants/t1/receipts/rec.pdf',
        expiresInSeconds: 900,
      });

      const result = await service.requestPresignedDownload('t1', 'tenants/t1/receipts/rec.pdf');
      expect(result.downloadUrl).toBe('https://r2.cloudflarestorage.com/signed-download');
    });
  });
});
