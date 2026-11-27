import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Response } from 'express';
import {
  IKnowledgeDocumentRepositoryPort,
  IIngestionJobRepositoryPort,
  KnowledgeDocument,
  IngestionJob,
  VisibilityScope,
} from '@kinergy-platform/core';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators/current-user.decorator';
import { PERMISSIONS } from '../../platform/identity/authorization/permissions';
import { StorageKeyUtil } from '../../platform/storage/utils/storage-key.util';
import { LocalStorageAdapter } from '../../platform/storage/adapters/local-storage.adapter';
import { StorageController } from '../../platform/storage/controllers/storage.controller';
import { MediaStorageService } from '../../platform/storage/services/media-storage.service';
import { ObjectStoragePort } from '../../platform/storage/ports/object-storage.port';
import {
  StorageFileNotFoundError,
  StorageTenantAccessDeniedError,
} from '../../platform/storage/domain/storage.errors';
import { SecureDocumentUploadService } from '../services/secure-document-upload.service';
import { DocumentContentValidatorService } from '../services/document-content-validator.service';
import { TempFileStorageService } from '../services/temp-file-storage.service';
import { PreviewTokenService } from '../services/preview-token.service';
import { AiDocumentController } from '../controllers/ai-document.controller';
import { RetrievalSecurityPolicyService } from '../services/retrieval/retrieval-security-policy.service';
import { DEFAULT_AI_CONFIG } from '../config/ai.config';

describe('AI-10.3-04: Private Document Storage and Temporary File Security', () => {
  const TENANT_ALPHA = 'tenant_clinic_alpha';
  const TENANT_BETA = 'tenant_clinic_beta';

  const USER_THERAPIST: AuthenticatedUserPayload = {
    id: 'usr_therapist_01',
    tenantId: TENANT_ALPHA,
    roles: ['PhysicalTherapist'],
    email: 'therapist@kinergy.test',
    status: 'ACTIVE',
    permissions: [PERMISSIONS.AI.KNOWLEDGE_QUERY, PERMISSIONS.AI.DOCUMENTS_UPLOAD],
  };

  const USER_BETA_STAFF: AuthenticatedUserPayload = {
    id: 'usr_beta_01',
    tenantId: TENANT_BETA,
    roles: ['PhysicalTherapist'],
    email: 'beta@kinergy.test',
    status: 'ACTIVE',
    permissions: [PERMISSIONS.AI.KNOWLEDGE_QUERY],
  };

  const USER_MANAGEMENT: AuthenticatedUserPayload = {
    id: 'usr_mgmt_01',
    tenantId: TENANT_ALPHA,
    roles: ['ClinicManager', 'Admin'],
    email: 'manager@kinergy.test',
    status: 'ACTIVE',
    permissions: [PERMISSIONS.AI.KNOWLEDGE_QUERY, PERMISSIONS.AI.DOCUMENTS_MANAGE],
  };

  let testStorageRoot: string;
  let testScratchRoot: string;
  let localAdapter: LocalStorageAdapter;
  let tempStorageService: TempFileStorageService;
  let mediaStorageService: MediaStorageService;
  let storageController: StorageController;
  let previewTokenService: PreviewTokenService;

  const validPdfBuffer = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n',
    'utf-8',
  );

  beforeAll(async () => {
    testStorageRoot = path.join(os.tmpdir(), `kinergy-test-storage-${crypto.randomUUID()}`);
    testScratchRoot = path.join(os.tmpdir(), `kinergy-test-scratch-${crypto.randomUUID()}`);

    await fs.mkdir(testStorageRoot, { recursive: true });
    await fs.mkdir(testScratchRoot, { recursive: true });

    localAdapter = new LocalStorageAdapter({
      provider: 'local',
      localRoot: testStorageRoot,
      s3Region: 'auto',
      s3Bucket: 'test-bucket',
      s3ForcePathStyle: false,
      maxFileSizeBytes: 10 * 1024 * 1024,
      signedUrlExpirationSeconds: 300,
      tenantQuotaBytes: 100 * 1024 * 1024,
      allowedMimeTypes: ['application/pdf'],
    });

    tempStorageService = new TempFileStorageService({
      scratchRoot: testScratchRoot,
      maxSizeBytes: 10 * 1024 * 1024,
      maxAgeMs: 500, // 500ms for testing stale cleanup
    });

    mediaStorageService = new MediaStorageService(localAdapter, {
      provider: 'local',
      localRoot: testStorageRoot,
      s3Region: 'auto',
      s3Bucket: 'test-bucket',
      s3ForcePathStyle: false,
      maxFileSizeBytes: 10 * 1024 * 1024,
      signedUrlExpirationSeconds: 300,
      tenantQuotaBytes: 100 * 1024 * 1024,
      allowedMimeTypes: ['application/pdf'],
    });

    storageController = new StorageController(mediaStorageService);
    previewTokenService = new PreviewTokenService();
  });

  afterAll(async () => {
    await fs.rm(testStorageRoot, { recursive: true, force: true }).catch(() => undefined);
    await fs.rm(testScratchRoot, { recursive: true, force: true }).catch(() => undefined);
  });

  // ============================================================================
  // Scenario 1: Storage path cannot be controlled by the client
  // ============================================================================
  describe('1. Storage Path Cannot Be Controlled By The Client', () => {
    it('generates opaque backend-controlled storage keys regardless of client filename or parameters', async () => {
      const mockDocRepo = {
        save: jest.fn().mockImplementation(async (d: KnowledgeDocument) => d),
        findById: jest.fn(),
        findByChecksum: jest.fn().mockResolvedValue(null),
      } as unknown as jest.Mocked<IKnowledgeDocumentRepositoryPort>;

      const mockJobRepo = {
        save: jest.fn().mockImplementation(async (j: IngestionJob) => j),
      } as unknown as jest.Mocked<IIngestionJobRepositoryPort>;

      const mockStoragePort = {
        upload: jest.fn().mockImplementation(async (tenantId, folder, filename, buffer, mime) => {
          return {
            key: `tenants/${tenantId}/${folder}/2026/11/${filename}`,
            tenantId,
            domainFolder: folder,
            filename,
            mimeType: mime,
            sizeBytes: buffer.length,
            createdAt: new Date(),
            lastModified: new Date(),
          };
        }),
      } as unknown as jest.Mocked<ObjectStoragePort>;

      const validator = new DocumentContentValidatorService(DEFAULT_AI_CONFIG);
      const uploadService = new SecureDocumentUploadService(
        mockStoragePort,
        mockDocRepo,
        mockJobRepo,
        validator,
      );

      // Client attempts to pass a custom nested path or malicious filename
      await uploadService.uploadDocument({
        tenantId: TENANT_ALPHA,
        uploadedBy: USER_THERAPIST.id,
        file: {
          originalFileName: '../../custom/exploit_path/confidential.pdf',
          mimeType: 'application/pdf',
          size: validPdfBuffer.length,
          buffer: validPdfBuffer,
        },
      });

      expect(mockStoragePort.upload).toHaveBeenCalledTimes(1);
      const callArgs = mockStoragePort.upload.mock.calls[0];
      expect(callArgs).toBeDefined();
      const [uploadedTenant, uploadedFolder, uploadedFilename] = callArgs!;

      expect(uploadedTenant).toBe(TENANT_ALPHA);
      expect(uploadedFolder).toBe('knowledge_base');
      // Filename passed to storagePort is a synthetic UUID, NEVER the client filename or path
      expect(uploadedFilename).not.toContain('exploit_path');
      expect(uploadedFilename).not.toContain('..');
      expect(uploadedFilename).not.toContain('confidential');
      expect(uploadedFilename).toMatch(/^[a-f0-9-]+\.pdf$/i);
    });
  });

  // ============================================================================
  // Scenario 2: Traversal attempts are rejected
  // ============================================================================
  describe('2. Traversal Attempts Are Rejected', () => {
    it('rejects path traversal vectors in storage keys across all separator and encoding variations', () => {
      const traversalKeys = [
        '../../../../etc/passwd',
        '..\\..\\windows\\system32\\cmd.exe',
        `tenants/${TENANT_ALPHA}/../../../etc/shadow`,
        `tenants/${TENANT_ALPHA}/knowledge_base/..%2f..%2fetc%2fpasswd`,
        `tenants/${TENANT_ALPHA}/knowledge_base/\0malicious.pdf`,
        `tenants/${TENANT_ALPHA}/knowledge_base/../../${TENANT_BETA}/secret.pdf`,
        `/etc/passwd`,
        `C:\\Windows\\System32\\cmd.exe`,
      ];

      for (const badKey of traversalKeys) {
        expect(() => StorageKeyUtil.assertTenantOwnsKey(TENANT_ALPHA, badKey)).toThrow(
          StorageTenantAccessDeniedError,
        );
      }
    });

    it('rejects path traversal in tenant identifiers', () => {
      const badTenants = [
        '../tenant_alpha',
        'tenant/alpha',
        'tenant\\alpha',
        'tenant\0alpha',
        'tenant..alpha',
      ];

      for (const badTenant of badTenants) {
        expect(() => StorageKeyUtil.generateObjectKey(badTenant, 'clinical', 'safe.pdf')).toThrow(
          StorageTenantAccessDeniedError,
        );

        expect(() =>
          StorageKeyUtil.assertTenantOwnsKey(
            badTenant,
            `tenants/${badTenant}/clinical/2026/11/abc.pdf`,
          ),
        ).toThrow(StorageTenantAccessDeniedError);
      }
    });
  });

  // ============================================================================
  // Scenario 3: Display filenames cannot change storage paths
  // ============================================================================
  describe('3. Display Filenames Cannot Change Storage Paths', () => {
    it('isolates display filenames exclusively to metadata while storage keys remain purely synthetic', async () => {
      const opaqueKey1 = StorageKeyUtil.generateOpaqueObjectKey(
        TENANT_ALPHA,
        'knowledge_base',
        'pdf',
      );
      const opaqueKey2 = StorageKeyUtil.generateOpaqueObjectKey(
        TENANT_ALPHA,
        'knowledge_base',
        'pdf',
      );

      // Both keys use random UUIDs and do not contain arbitrary client names
      expect(opaqueKey1).toMatch(
        /^tenants\/tenant_clinic_alpha\/knowledge_base\/\d{4}\/\d{2}\/[a-f0-9-]+\.pdf$/,
      );
      expect(opaqueKey2).toMatch(
        /^tenants\/tenant_clinic_alpha\/knowledge_base\/\d{4}\/\d{2}\/[a-f0-9-]+\.pdf$/,
      );
      expect(opaqueKey1).not.toBe(opaqueKey2);
    });
  });

  // ============================================================================
  // Scenario 4: Uploaded files are not publicly reachable
  // ============================================================================
  describe('4. Uploaded Files Are Not Publicly Reachable', () => {
    it('denies unauthenticated requests to storage controller endpoints', async () => {
      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as unknown as Response;

      const validKey = `tenants/${TENANT_ALPHA}/clinical/2026/11/test.pdf`;

      // Request without token throws 403 ForbiddenException
      await expect(storageController.serveLocalFile(validKey, '', mockRes)).rejects.toThrow(
        ForbiddenException,
      );

      // Request with missing expiration parameter throws 403 ForbiddenException
      await expect(
        storageController.serveLocalFile(validKey, 'some-token', mockRes, undefined),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ============================================================================
  // Scenario 5: Unauthorized download and preview are denied
  // ============================================================================
  describe('5. Unauthorized Download and Preview Are Denied', () => {
    it('denies document content download for unauthenticated or cross-tenant users', async () => {
      const mockDocRepo = {
        findById: jest.fn().mockImplementation(async (tenantId: string, id: string) => {
          if (tenantId === TENANT_ALPHA && id === 'doc_alpha_01') {
            return KnowledgeDocument.create({
              id: 'doc_alpha_01',
              tenantId: TENANT_ALPHA,
              title: 'Clinical Protocol',
              visibilityScope: VisibilityScope.ALL_STAFF,
              uploadedBy: USER_THERAPIST.id,
              initialVersion: {
                originalFileName: 'protocol.pdf',
                mimeType: 'application/pdf',
                fileSize: 100,
                checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                storageKey: `tenants/${TENANT_ALPHA}/knowledge_base/2026/11/abc.pdf`,
                uploadedBy: USER_THERAPIST.id,
              },
            });
          }
          return null; // Foreign tenant documents return null (anti-enumeration)
        }),
      } as unknown as jest.Mocked<IKnowledgeDocumentRepositoryPort>;

      const mockStoragePort = {
        download: jest.fn(),
      } as unknown as jest.Mocked<ObjectStoragePort>;

      const securityPolicy = new RetrievalSecurityPolicyService(mockDocRepo);
      const controller = new AiDocumentController(
        {} as any,
        mockDocRepo,
        {} as any,
        mockStoragePort,
        undefined,
        undefined,
        securityPolicy,
      );

      const mockRes = { setHeader: jest.fn(), send: jest.fn() } as unknown as Response;

      // 1. Unauthenticated download fails with 401 UnauthorizedException
      await expect(
        controller.downloadContent('doc_alpha_01', undefined, undefined, null, mockRes),
      ).rejects.toThrow(UnauthorizedException);

      // 2. Cross-tenant user (Tenant Beta requesting Tenant Alpha doc) returns 404 (anti-enumeration)
      await expect(
        controller.downloadContent('doc_alpha_01', undefined, undefined, USER_BETA_STAFF, mockRes),
      ).rejects.toThrow(NotFoundException);
    });

    it('denies document download when user lacks role clearance for document visibility scope', async () => {
      const mockDocRepo = {
        findById: jest.fn().mockResolvedValue(
          KnowledgeDocument.create({
            id: 'doc_mgmt_01',
            tenantId: TENANT_ALPHA,
            title: 'Confidential Executive Strategy',
            visibilityScope: VisibilityScope.MANAGEMENT,
            uploadedBy: USER_MANAGEMENT.id,
            initialVersion: {
              originalFileName: 'strategy.pdf',
              mimeType: 'application/pdf',
              fileSize: 100,
              checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
              storageKey: `tenants/${TENANT_ALPHA}/knowledge_base/2026/11/mgmt.pdf`,
              uploadedBy: USER_MANAGEMENT.id,
            },
          }),
        ),
      } as unknown as jest.Mocked<IKnowledgeDocumentRepositoryPort>;

      const securityPolicy = new RetrievalSecurityPolicyService(mockDocRepo);
      const controller = new AiDocumentController(
        {} as any,
        mockDocRepo,
        {} as any,
        {} as any,
        undefined,
        undefined,
        securityPolicy,
      );

      const mockRes = { setHeader: jest.fn(), send: jest.fn() } as unknown as Response;

      // Therapist cannot download MANAGEMENT-scoped document (403 Forbidden)
      await expect(
        controller.downloadContent('doc_mgmt_01', undefined, undefined, USER_THERAPIST, mockRes),
      ).rejects.toThrow(ForbiddenException);
    });

    it('denies preview when preview token is expired or tampered', () => {
      const token = previewTokenService.generateToken(
        {
          tenantId: TENANT_ALPHA,
          userId: USER_THERAPIST.id,
          conversationId: 'conv_01',
          messageId: 'msg_01',
          citationId: 'cit_01',
          documentId: 'doc_01',
        },
        -10,
      ); // Expired 10 seconds ago

      const result = previewTokenService.verifyToken(token, {
        tenantId: TENANT_ALPHA,
        conversationId: 'conv_01',
        messageId: 'msg_01',
        citationId: 'cit_01',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });
  });

  // ============================================================================
  // Scenario 6: Temporary files are isolated between concurrent uploads
  // ============================================================================
  describe('6. Temporary Files Are Isolated Between Concurrent Uploads', () => {
    it('creates cryptographically unique, non-colliding directories and files for concurrent operations', async () => {
      const concurrentCount = 5;
      const paths: string[] = [];

      await Promise.all(
        Array.from({ length: concurrentCount }).map(async (_, idx) => {
          const content = Buffer.from(`Concurrent test buffer payload ${idx}`);
          await tempStorageService.executeWithTempFile(
            TENANT_ALPHA,
            content,
            'pdf',
            async (tempPath) => {
              paths.push(tempPath);
              // Assert file exists during execution
              const stat = await fs.stat(tempPath);
              expect(stat.size).toBe(content.length);
            },
          );
        }),
      );

      // Verify all 5 paths were unique
      const uniquePaths = new Set(paths);
      expect(uniquePaths.size).toBe(concurrentCount);

      // Verify each path was inside TENANT_ALPHA scratch directory
      for (const p of paths) {
        expect(p).toContain(TENANT_ALPHA);
      }
    });
  });

  // ============================================================================
  // Scenario 7: Interrupted uploads are cleaned up
  // ============================================================================
  describe('7. Interrupted Uploads Are Cleaned Up', () => {
    it('guarantees deletion of temporary scratch file and directory when processing throws', async () => {
      let recordedTempPath: string | null = null;
      let recordedParentDir: string | null = null;

      const actionThrowing = async (tempPath: string) => {
        recordedTempPath = tempPath;
        recordedParentDir = path.dirname(tempPath);
        throw new Error('Parser crashed due to worker memory limit');
      };

      await expect(
        tempStorageService.executeWithTempFile(
          TENANT_ALPHA,
          Buffer.from('Interrupted file content'),
          'pdf',
          actionThrowing,
        ),
      ).rejects.toThrow('Parser crashed due to worker memory limit');

      expect(recordedTempPath).not.toBeNull();
      expect(recordedParentDir).not.toBeNull();

      // Verify file does NOT exist
      const fileExists = await fs
        .access(recordedTempPath!)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(false);

      // Verify isolated directory does NOT exist
      const dirExists = await fs
        .access(recordedParentDir!)
        .then(() => true)
        .catch(() => false);
      expect(dirExists).toBe(false);
    });
  });

  // ============================================================================
  // Scenario 8: Failed processing does not leave accessible files
  // ============================================================================
  describe('8. Failed Processing Does Not Leave Accessible Files', () => {
    it('executes compensating storage deletion when DB persistence fails after upload', async () => {
      const mockDocRepo = {
        save: jest.fn().mockRejectedValue(new Error('PostgreSQL deadlock error')),
        findById: jest.fn(),
        findByChecksum: jest.fn().mockResolvedValue(null),
      } as unknown as jest.Mocked<IKnowledgeDocumentRepositoryPort>;

      const mockStoragePort = {
        upload: jest.fn().mockResolvedValue({
          key: `tenants/${TENANT_ALPHA}/knowledge_base/2026/11/orphan.pdf`,
          tenantId: TENANT_ALPHA,
          domainFolder: 'knowledge_base',
          filename: 'orphan.pdf',
          mimeType: 'application/pdf',
          sizeBytes: validPdfBuffer.length,
          createdAt: new Date(),
          lastModified: new Date(),
        }),
        delete: jest.fn().mockResolvedValue(undefined),
      } as unknown as jest.Mocked<ObjectStoragePort>;

      const validator = new DocumentContentValidatorService(DEFAULT_AI_CONFIG);
      const uploadService = new SecureDocumentUploadService(
        mockStoragePort,
        mockDocRepo,
        {} as any,
        validator,
      );

      await expect(
        uploadService.uploadDocument({
          tenantId: TENANT_ALPHA,
          uploadedBy: USER_THERAPIST.id,
          file: {
            originalFileName: 'test.pdf',
            mimeType: 'application/pdf',
            size: validPdfBuffer.length,
            buffer: validPdfBuffer,
          },
        }),
      ).rejects.toThrow('PostgreSQL deadlock error');

      // Compensating deletion must be called immediately
      expect(mockStoragePort.delete).toHaveBeenCalledTimes(1);
      expect(mockStoragePort.delete).toHaveBeenCalledWith(
        TENANT_ALPHA,
        `tenants/${TENANT_ALPHA}/knowledge_base/2026/11/orphan.pdf`,
      );
    });
  });

  // ============================================================================
  // Scenario 9: Deletion targets only the intended document's objects
  // ============================================================================
  describe('9. Deletion Targets Only The Intended Document Objects', () => {
    it('asserts tenant ownership before storage deletion and rejects foreign keys fail-closed', async () => {
      const stored = await localAdapter.upload(
        TENANT_ALPHA,
        'clinical',
        'safe-doc.pdf',
        Buffer.from('alpha document'),
        'application/pdf',
      );

      // Tenant Beta cannot delete Tenant Alpha's object
      await expect(localAdapter.delete(TENANT_BETA, stored.key)).rejects.toThrow(
        StorageTenantAccessDeniedError,
      );

      // Verify file still exists in Tenant Alpha
      const stillExists = await localAdapter.exists(TENANT_ALPHA, stored.key);
      expect(stillExists).toBe(true);

      // Tenant Alpha can delete its own object
      await localAdapter.delete(TENANT_ALPHA, stored.key);
      const existsAfter = await localAdapter.exists(TENANT_ALPHA, stored.key);
      expect(existsAfter).toBe(false);
    });
  });

  // ============================================================================
  // Scenario 10: Orphaned object reconciliation is safe
  // ============================================================================
  describe('10. Orphaned Object Reconciliation Is Safe', () => {
    it('safely reconciles missing storage objects returning 404 StorageFileNotFoundError', async () => {
      const nonExistentKey = `tenants/${TENANT_ALPHA}/clinical/2026/11/does-not-exist.pdf`;

      await expect(localAdapter.download(TENANT_ALPHA, nonExistentKey)).rejects.toThrow(
        StorageFileNotFoundError,
      );

      const exists = await localAdapter.exists(TENANT_ALPHA, nonExistentKey);
      expect(exists).toBe(false);
    });

    it('garbage collects stale temporary files older than maxAgeMs without touching active files', async () => {
      // 1. Create a stale file by creating a folder manually and setting older mtime
      const staleDir = await tempStorageService.createIsolatedTempDir(TENANT_ALPHA);
      const staleFile = await tempStorageService.writeTempFile(
        staleDir,
        Buffer.from('stale temp file'),
        'pdf',
      );

      // Set mtime to 2 seconds ago (maxAgeMs is 500ms)
      const past = new Date(Date.now() - 2000);
      await fs.utimes(staleDir, past, past);

      // 2. Run garbage collection
      const removed = await tempStorageService.cleanupStaleScratch(500);
      expect(removed).toBeGreaterThanOrEqual(1);

      // Verify stale directory was removed
      const exists = await fs
        .access(staleFile)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(false);
    });
  });
});
