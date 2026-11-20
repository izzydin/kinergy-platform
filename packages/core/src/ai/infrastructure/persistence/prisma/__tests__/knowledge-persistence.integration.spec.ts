import { PrismaClient } from '@prisma/client';
import { PrismaKnowledgeDocumentRepository } from '../repositories/prisma-knowledge-document.repository';
import { PrismaIngestionJobRepository } from '../repositories/prisma-ingestion-job.repository';
import { KnowledgeDocument } from '../../../../domain/models/knowledge-document.aggregate';
import { IngestionJob } from '../../../../domain/models/ingestion-job.aggregate';
import { IngestionStatus } from '../../../../domain/enums/ingestion-status.enum';
import { DocumentFormat } from '../../../../domain/enums/document-format.enum';
import { VisibilityScope } from '../../../../domain/enums/visibility-scope.enum';
import {
  DuplicateActiveIngestionException,
  DuplicateDocumentVersionException,
  UnauthorizedDocumentAccessException,
} from '../../../../domain/exceptions/knowledge-document.exceptions';

describe('AI-03.2 — Knowledge Management Persistence Integration', () => {
  let prisma: PrismaClient;
  let docRepo: PrismaKnowledgeDocumentRepository;
  let jobRepo: PrismaIngestionJobRepository;
  let isDbAvailable = false;

  const testTenantA = `tenant_ai_test_a_${Date.now()}`;
  const testTenantB = `tenant_ai_test_b_${Date.now()}`;

  const checksum1 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  const checksum2 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  const checksum3 = 'cb8379ac2098aa165029e3938a51da0bcecfc008fd6795f401178647f96c5b34';

  beforeAll(async () => {
    prisma = new PrismaClient();
    try {
      await prisma.$connect();
      await prisma.$queryRawUnsafe('SELECT 1');
      isDbAvailable = true;
      docRepo = new PrismaKnowledgeDocumentRepository(prisma);
      jobRepo = new PrismaIngestionJobRepository(prisma);
    } catch (err) {
      isDbAvailable = false;
      console.warn(
        'PostgreSQL database not available for integration tests; skipping live persistence tests.',
        err,
      );
    }
  });

  afterAll(async () => {
    if (isDbAvailable && prisma) {
      // Clean up test tenant fixtures
      await prisma.knowledgeDocument
        .deleteMany({
          where: { tenantId: { in: [testTenantA, testTenantB] } },
        })
        .catch(() => {});
      await prisma.$disconnect();
    }
  });

  it('1. should create and persist a KnowledgeDocument with initial version atomically', async () => {
    if (!isDbAvailable) return;

    const doc = KnowledgeDocument.create({
      title: 'Facility Safety Protocols',
      description: 'Emergency guidelines for clinic and gym staff',
      tenantId: testTenantA,
      uploadedBy: 'staff_1',
      visibilityScope: VisibilityScope.ALL_STAFF,
      initialVersion: {
        originalFileName: 'safety_manual.pdf',
        mimeType: DocumentFormat.PDF,
        fileSize: 102400,
        checksum: checksum1,
        storageKey: `tenants/${testTenantA}/knowledge_base/safety_manual.pdf`,
      },
    });

    const saved = await docRepo.save(doc);
    expect(saved.id.value).toBe(doc.id.value);

    // Retrieve from database
    const retrieved = await docRepo.findById(testTenantA, doc.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.title).toBe('Facility Safety Protocols');
    expect(retrieved?.tenantId).toBe(testTenantA);
    expect(retrieved?.version).toBe(2);
    expect(retrieved?.currentVersionId).toBeDefined();

    const currentVer = retrieved?.getCurrentVersion();
    expect(currentVer?.versionNumber).toBe(1);
    expect(currentVer?.checksum).toBe(checksum1);
    expect(currentVer?.originalFileName).toBe('safety_manual.pdf');
  });

  it('2. should persist subsequent versions and support historical version retrieval', async () => {
    if (!isDbAvailable) return;

    const doc = KnowledgeDocument.create({
      title: 'Kinesiology Treatment Guidelines',
      tenantId: testTenantA,
      uploadedBy: 'therapist_lead',
      initialVersion: {
        originalFileName: 'guidelines_2025.pdf',
        mimeType: DocumentFormat.PDF,
        fileSize: 204800,
        checksum: checksum2,
        storageKey: `tenants/${testTenantA}/knowledge_base/v1.pdf`,
      },
    });
    await docRepo.save(doc);

    // Add version 2
    const v2 = doc.addVersion({
      originalFileName: 'guidelines_2026.docx',
      mimeType: DocumentFormat.DOCX,
      fileSize: 250000,
      checksum: checksum3,
      storageKey: `tenants/${testTenantA}/knowledge_base/v2.docx`,
      uploadedBy: 'therapist_lead',
    });
    await docRepo.save(doc);

    // Re-query from database
    const retrieved = await docRepo.findById(testTenantA, doc.id);
    expect(retrieved?.getAllVersions()).toHaveLength(2);
    expect(retrieved?.currentVersionId).toBe(v2.id);

    // Historical version queries
    const ver1 = retrieved?.getVersion(1);
    const ver2 = retrieved?.getVersion(2);
    expect(ver1?.checksum).toBe(checksum2);
    expect(ver2?.checksum).toBe(checksum3);
    expect(ver2?.versionNumber).toBe(2);
  });

  it('3. should reject duplicate checksum version insertion within the same document', async () => {
    if (!isDbAvailable) return;

    const doc = KnowledgeDocument.create({
      title: 'Nutrition Handbook',
      tenantId: testTenantA,
      uploadedBy: 'trainer_1',
      initialVersion: {
        originalFileName: 'nutrition.pdf',
        mimeType: DocumentFormat.PDF,
        fileSize: 50000,
        checksum: checksum1,
        storageKey: `tenants/${testTenantA}/knowledge_base/nutrition.pdf`,
      },
    });
    await docRepo.save(doc);

    // Domain rejects duplicate checksum before save
    expect(() =>
      doc.addVersion({
        originalFileName: 'nutrition_dup.pdf',
        mimeType: DocumentFormat.PDF,
        fileSize: 50000,
        checksum: checksum1,
        storageKey: 'key_dup',
      }),
    ).toThrow(DuplicateDocumentVersionException);
  });

  it('4. should enforce strict tenant boundary isolation across queries and mutations', async () => {
    if (!isDbAvailable) return;

    const docA = KnowledgeDocument.create({
      title: 'Confidential Tenant A SOP',
      tenantId: testTenantA,
      uploadedBy: 'admin_a',
      initialVersion: {
        originalFileName: 'sop_a.pdf',
        mimeType: DocumentFormat.PDF,
        fileSize: 1000,
        checksum: checksum2,
        storageKey: 'key_a',
      },
    });
    await docRepo.save(docA);

    // 1. Tenant B query for Tenant A document returns null
    const crossTenantGet = await docRepo.findById(testTenantB, docA.id);
    expect(crossTenantGet).toBeNull();

    // 2. Tenant B list never includes Tenant A documents
    const tenantBDocs = await docRepo.findAll(testTenantB);
    expect(tenantBDocs.some((d) => d.id.value === docA.id.value)).toBe(false);

    // 3. Attempting to mutate Tenant A doc with Tenant B identity in repository throws Unauthorized
    const forgedDoc = KnowledgeDocument.reconstitute({
      id: docA.id,
      title: 'Hijacked Title',
      description: null,
      tenantId: testTenantB, // Attempted forgery
      uploadedBy: 'intruder',
      visibilityScope: VisibilityScope.ALL_STAFF,
      currentVersionId: docA.currentVersionId,
      version: 99,
      versions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    await expect(docRepo.save(forgedDoc)).rejects.toThrow(UnauthorizedDocumentAccessException);
  });

  it('5. should execute soft deletion and exclude soft-deleted documents from standard queries', async () => {
    if (!isDbAvailable) return;

    const doc = KnowledgeDocument.create({
      title: 'Deprecated Protocol',
      tenantId: testTenantA,
      uploadedBy: 'staff_1',
    });
    await docRepo.save(doc);

    // Soft delete
    await docRepo.softDelete(testTenantA, doc.id, 'admin_user');

    // Standard findAll should exclude it
    const activeList = await docRepo.findAll(testTenantA, { includeDeleted: false });
    expect(activeList.some((d) => d.id.value === doc.id.value)).toBe(false);

    // findAll with includeDeleted should include it
    const allList = await docRepo.findAll(testTenantA, { includeDeleted: true });
    const found = allList.find((d) => d.id.value === doc.id.value);
    expect(found).toBeDefined();
    expect(found?.isDeleted()).toBe(true);
    expect(found?.deletedAt).toBeInstanceOf(Date);
  });

  it('6. should persist IngestionJob and enforce duplicate active ingestion prevention', async () => {
    if (!isDbAvailable) return;

    const doc = KnowledgeDocument.create({
      title: 'Ingestion Concurrency Doc',
      tenantId: testTenantA,
      uploadedBy: 'admin',
      initialVersion: {
        originalFileName: 'concurrency.md',
        mimeType: DocumentFormat.MARKDOWN,
        fileSize: 2000,
        checksum: checksum3,
        storageKey: 'key_concurrent',
      },
    });
    await docRepo.save(doc);

    const versionId = doc.getCurrentVersion()!.id;

    // Create first active ingestion job
    const job1 = IngestionJob.create({
      documentId: doc.id.value,
      documentVersionId: versionId,
      tenantId: testTenantA,
    });
    await jobRepo.save(job1);

    // Attempting to create a second active job for the SAME version must be rejected!
    const job2 = IngestionJob.create({
      documentId: doc.id.value,
      documentVersionId: versionId,
      tenantId: testTenantA,
    });

    await expect(jobRepo.save(job2)).rejects.toThrow(DuplicateActiveIngestionException);

    // Transition job1 to FAILED
    job1.startValidation();
    job1.fail('TIMEOUT', 'Inference timeout');
    await jobRepo.save(job1);

    // Once job1 is FAILED (terminal active), a new job or retry can be saved!
    const activeJob = await jobRepo.findActiveJobByVersionId(testTenantA, versionId);
    expect(activeJob).toBeNull();

    // Retry job1
    job1.retry(new Date(Date.now() - 1000));
    await jobRepo.save(job1);

    expect(job1.attemptCount).toBe(2);
    expect(job1.status).toBe(IngestionStatus.VALIDATING);
  });

  it('7. should enforce referential integrity cascade deletion', async () => {
    if (!isDbAvailable) return;

    const doc = KnowledgeDocument.create({
      title: 'Cascade Delete Target',
      tenantId: testTenantA,
      uploadedBy: 'admin',
      initialVersion: {
        originalFileName: 'target.txt',
        mimeType: DocumentFormat.TXT,
        fileSize: 500,
        checksum: checksum1,
        storageKey: 'key_cascade',
      },
    });
    await docRepo.save(doc);

    const versionId = doc.getCurrentVersion()!.id;
    const job = IngestionJob.create({
      documentId: doc.id.value,
      documentVersionId: versionId,
      tenantId: testTenantA,
    });
    await jobRepo.save(job);

    // Hard delete parent document at the relational level
    await prisma.knowledgeDocument.delete({
      where: { id: doc.id.value },
    });

    // Invariant: cascade onDelete: Cascade deletes child DocumentVersion and IngestionJob records
    const remainingVer = await prisma.documentVersion.findUnique({
      where: { id: versionId },
    });
    const remainingJob = await prisma.ingestionJob.findUnique({
      where: { id: job.id },
    });

    expect(remainingVer).toBeNull();
    expect(remainingJob).toBeNull();
  });
});
