import { Readable } from 'stream';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { S3StorageAdapter } from '../adapters/s3-storage.adapter';
import { StorageConfiguration } from '../config/storage.config';
import {
  StorageConfigurationError,
  StorageFileNotFoundError,
  StorageTenantAccessDeniedError,
} from '../domain/storage.errors';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest
    .fn()
    .mockResolvedValue('https://mock-r2.cloudflarestorage.com/bucket/key?token=mockSignature123'),
}));

describe('S3StorageAdapter (Unit & Mocked S3 Integration)', () => {
  let adapter: S3StorageAdapter;
  let mockSend: jest.Mock;

  const mockConfig: StorageConfiguration = {
    provider: 's3',
    localRoot: './.storage',
    s3Endpoint: 'https://test-account-id.r2.cloudflarestorage.com',
    s3Region: 'auto',
    s3Bucket: 'kinergy-staging-media',
    s3AccessKeyId: 'mockAccessKey',
    s3SecretAccessKey: 'mockSecretKey',
    s3ForcePathStyle: false,
    maxFileSizeBytes: 10 * 1024 * 1024,
    signedUrlExpirationSeconds: 900,
    tenantQuotaBytes: 100 * 1024 * 1024,
    allowedMimeTypes: ['application/pdf', 'image/png'],
  };

  beforeEach(() => {
    mockSend = jest.fn();
    jest.spyOn(S3Client.prototype, 'send').mockImplementation(mockSend);
    adapter = new S3StorageAdapter(mockConfig);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws StorageConfigurationError if bucket is missing', () => {
    expect(
      () =>
        new S3StorageAdapter({
          ...mockConfig,
          s3Bucket: '',
        }),
    ).toThrow(StorageConfigurationError);
  });

  it('uploads object with PutObjectCommand to configured bucket', async () => {
    mockSend.mockResolvedValueOnce({ ETag: '"test-etag-123"' });

    const tenantId = 'tenant_s3';
    const content = Buffer.from('clinical test data');
    const metadata = await adapter.upload(
      tenantId,
      'clinical',
      'treatment.pdf',
      content,
      'application/pdf',
    );

    expect(mockSend).toHaveBeenCalledWith(expect.any(PutObjectCommand));
    const commandCall = mockSend.mock.calls[0]?.[0] as PutObjectCommand;
    expect(commandCall.input.Bucket).toBe('kinergy-staging-media');
    expect(commandCall.input.ContentType).toBe('application/pdf');
    expect(commandCall.input.Key).toContain('tenants/tenant_s3/clinical');

    expect(metadata.etag).toBe('test-etag-123');
    expect(metadata.sizeBytes).toBe(content.length);
  });

  it('downloads object and converts stream to buffer', async () => {
    const tenantId = 'tenant_s3';
    const key = 'tenants/tenant_s3/clinical/2026/11/abc-notes.pdf';

    const readable = Readable.from(['stream data content']);
    mockSend.mockResolvedValueOnce({
      Body: readable,
    });

    // Mock HeadObject for metadata
    mockSend.mockResolvedValueOnce({
      ContentType: 'application/pdf',
      ContentLength: 19,
      ETag: '"stream-etag"',
      Metadata: { originalfilename: 'notes.pdf' },
      LastModified: new Date('2026-11-03T10:00:00Z'),
    });

    const result = await adapter.download(tenantId, key);

    expect(mockSend).toHaveBeenCalledWith(expect.any(GetObjectCommand));
    expect(result.data.toString('utf-8')).toBe('stream data content');
    expect(result.metadata.filename).toBe('notes.pdf');
  });

  it('checks object existence via HeadObjectCommand', async () => {
    const tenantId = 'tenant_s3';
    const key = 'tenants/tenant_s3/receipts/2026/11/abc-rec.pdf';

    mockSend.mockResolvedValueOnce({ ContentLength: 50 });
    const exists = await adapter.exists(tenantId, key);
    expect(exists).toBe(true);

    // Not found
    const notFoundError = new Error('Not Found');
    notFoundError.name = 'NotFound';
    mockSend.mockRejectedValueOnce(notFoundError);
    const notExists = await adapter.exists(tenantId, key);
    expect(notExists).toBe(false);
  });

  it('deletes object with DeleteObjectCommand', async () => {
    const tenantId = 'tenant_s3';
    const key = 'tenants/tenant_s3/clients/2026/11/abc-avatar.png';

    mockSend.mockResolvedValueOnce({});
    await adapter.delete(tenantId, key);

    expect(mockSend).toHaveBeenCalledWith(expect.any(DeleteObjectCommand));
    const commandCall = mockSend.mock.calls[0]?.[0] as DeleteObjectCommand;
    expect(commandCall.input.Key).toBe(key);
  });

  it('generates presigned download and upload URLs', async () => {
    const tenantId = 'tenant_s3';
    const key = 'tenants/tenant_s3/clinical/2026/11/abc-file.pdf';

    // Mock exists check
    mockSend.mockResolvedValueOnce({ ContentLength: 100 });

    const downloadResult = await adapter.createPresignedDownloadUrl(tenantId, key);
    expect(downloadResult.downloadUrl).toContain('https://mock-r2.cloudflarestorage.com');
    expect(downloadResult.key).toBe(key);

    const uploadResult = await adapter.createPresignedUploadUrl(
      tenantId,
      'clinical',
      'scan.pdf',
      'application/pdf',
    );
    expect(uploadResult.uploadUrl).toContain('https://mock-r2.cloudflarestorage.com');
    expect(uploadResult.method).toBe('PUT');
  });

  it('translates S3 NotFound / NoSuchKey to StorageFileNotFoundError', async () => {
    const tenantId = 'tenant_s3';
    const key = 'tenants/tenant_s3/clinical/2026/11/missing.pdf';

    const notFoundError = new Error('NoSuchKey');
    notFoundError.name = 'NoSuchKey';
    mockSend.mockRejectedValue(notFoundError);

    await expect(adapter.download(tenantId, key)).rejects.toThrow(StorageFileNotFoundError);
    await expect(adapter.createPresignedDownloadUrl(tenantId, key)).rejects.toThrow(
      StorageFileNotFoundError,
    );
  });

  it('strictly rejects cross-tenant operations before invoking S3', async () => {
    const tenantA = 'tenant_A';
    const foreignKey = 'tenants/tenant_B/clinical/2026/11/file.pdf';

    await expect(adapter.download(tenantA, foreignKey)).rejects.toThrow(
      StorageTenantAccessDeniedError,
    );
    await expect(adapter.delete(tenantA, foreignKey)).rejects.toThrow(
      StorageTenantAccessDeniedError,
    );
    await expect(adapter.exists(tenantA, foreignKey)).rejects.toThrow(
      StorageTenantAccessDeniedError,
    );
    await expect(adapter.createPresignedDownloadUrl(tenantA, foreignKey)).rejects.toThrow(
      StorageTenantAccessDeniedError,
    );

    // Zero S3 calls dispatched when tenant verification fails
    expect(mockSend).not.toHaveBeenCalled();
  });
});
