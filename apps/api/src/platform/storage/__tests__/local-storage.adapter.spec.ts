import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { LocalStorageAdapter } from '../adapters/local-storage.adapter';
import { StorageConfiguration } from '../config/storage.config';
import { StorageFileNotFoundError, StorageTenantAccessDeniedError } from '../domain/storage.errors';

describe('LocalStorageAdapter (Integration)', () => {
  let testRoot: string;
  let adapter: LocalStorageAdapter;

  beforeAll(async () => {
    testRoot = path.join(os.tmpdir(), `kinergy-test-storage-${Date.now()}`);
    await fs.mkdir(testRoot, { recursive: true });

    const config: StorageConfiguration = {
      provider: 'local',
      localRoot: testRoot,
      s3Region: 'auto',
      s3Bucket: 'test-bucket',
      s3ForcePathStyle: false,
      maxFileSizeBytes: 10 * 1024 * 1024,
      signedUrlExpirationSeconds: 900,
      tenantQuotaBytes: 100 * 1024 * 1024,
      allowedMimeTypes: ['application/pdf', 'image/png'],
    };

    adapter = new LocalStorageAdapter(config);
  });

  afterAll(async () => {
    await fs.rm(testRoot, { recursive: true, force: true }).catch(() => undefined);
  });

  it('uploads, exists, retrieves metadata, and downloads file content correctly', async () => {
    const tenantId = 'tenant_100';
    const content = Buffer.from('PDF sample clinical binary content');
    const metadata = await adapter.upload(
      tenantId,
      'clinical',
      'treatment-notes.pdf',
      content,
      'application/pdf',
    );

    expect(metadata.key).toContain('tenants/tenant_100/clinical');
    expect(metadata.sizeBytes).toBe(content.length);
    expect(metadata.mimeType).toBe('application/pdf');

    // Exists
    const exists = await adapter.exists(tenantId, metadata.key);
    expect(exists).toBe(true);

    // Metadata
    const fetchedMeta = await adapter.getMetadata(tenantId, metadata.key);
    expect(fetchedMeta.filename).toBe('treatment-notes.pdf');
    expect(fetchedMeta.sizeBytes).toBe(content.length);

    // Download
    const downloaded = await adapter.download(tenantId, metadata.key);
    expect(downloaded.data.toString('utf-8')).toBe(content.toString('utf-8'));
  });

  it('generates presigned download and upload URLs', async () => {
    const tenantId = 'tenant_100';
    const content = Buffer.from('receipt binary');
    const uploaded = await adapter.upload(
      tenantId,
      'receipts',
      'receipt_1.pdf',
      content,
      'application/pdf',
    );

    // Download URL
    const presignedDownload = await adapter.createPresignedDownloadUrl(tenantId, uploaded.key);
    expect(presignedDownload.downloadUrl).toContain('/api/v1/storage/local/');
    expect(presignedDownload.downloadUrl).toContain('token=');

    // Upload URL
    const presignedUpload = await adapter.createPresignedUploadUrl(
      tenantId,
      'clinical',
      'scan.png',
      'image/png',
    );
    expect(presignedUpload.uploadUrl).toContain('/api/v1/storage/local/');
    expect(presignedUpload.method).toBe('PUT');
  });

  it('deletes file and subsequent download throws StorageFileNotFoundError', async () => {
    const tenantId = 'tenant_100';
    const content = Buffer.from('temp file');
    const uploaded = await adapter.upload(tenantId, 'clients', 'avatar.png', content, 'image/png');

    await adapter.delete(tenantId, uploaded.key);

    const exists = await adapter.exists(tenantId, uploaded.key);
    expect(exists).toBe(false);

    await expect(adapter.download(tenantId, uploaded.key)).rejects.toThrow(
      StorageFileNotFoundError,
    );
  });

  it('rejects cross-tenant access with StorageTenantAccessDeniedError', async () => {
    const tenantA = 'tenant_A';
    const tenantB = 'tenant_B';
    const content = Buffer.from('confidential clinical scan');
    const uploaded = await adapter.upload(
      tenantA,
      'clinical',
      'confidential.pdf',
      content,
      'application/pdf',
    );

    // Tenant B attempts to read Tenant A's file
    await expect(adapter.download(tenantB, uploaded.key)).rejects.toThrow(
      StorageTenantAccessDeniedError,
    );

    // Tenant B attempts to delete Tenant A's file
    await expect(adapter.delete(tenantB, uploaded.key)).rejects.toThrow(
      StorageTenantAccessDeniedError,
    );

    // Tenant B attempts to generate presigned download URL
    await expect(adapter.createPresignedDownloadUrl(tenantB, uploaded.key)).rejects.toThrow(
      StorageTenantAccessDeniedError,
    );
  });
});
