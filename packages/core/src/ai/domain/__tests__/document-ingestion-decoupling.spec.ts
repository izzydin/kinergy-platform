import { KnowledgeDocument } from '../models/knowledge-document.aggregate';
import { IngestionJob } from '../models/ingestion-job.aggregate';
import { IngestionStatus } from '../enums/ingestion-status.enum';
import { DocumentFormat } from '../enums/document-format.enum';

describe('Document and Ingestion Lifecycle Decoupling (AI-03 Domain Invariant)', () => {
  const checksumA = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  const checksumB = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

  it('guarantees source document version remains intact when ingestion fails', () => {
    // 1. Create document and initial immutable version
    const doc = KnowledgeDocument.create({
      title: 'Biomechanics Standard Operating Procedure',
      tenantId: 'tenant_clinic',
      uploadedBy: 'dr_physio',
      initialVersion: {
        originalFileName: 'biomechanics.pdf',
        mimeType: DocumentFormat.PDF,
        fileSize: 204800,
        checksum: checksumA,
        storageKey: 'tenants/tenant_clinic/knowledge_base/biomechanics.pdf',
      },
    });

    const v1 = doc.getCurrentVersion();
    expect(v1).toBeDefined();
    expect(v1?.versionNumber).toBe(1);

    // 2. Launch asynchronous ingestion job
    const job = IngestionJob.create({
      documentId: doc.id.value,
      documentVersionId: v1!.id,
      tenantId: doc.tenantId,
    });

    // 3. Ingestion progresses, but encounters an unrecoverable text extraction error
    job.startValidation();
    job.startProcessing();
    job.fail('PARSER_ERROR', 'Scanned image PDF without embedded font table');

    expect(job.status).toBe(IngestionStatus.FAILED);

    // 4. Invariant: Document aggregate and DocumentVersion are completely unharmed
    expect(doc.isDeleted()).toBe(false);
    expect(doc.getAllVersions()).toHaveLength(1);
    expect(doc.getCurrentVersion()?.id).toBe(v1!.id);
    expect(doc.getCurrentVersion()?.checksum).toBe(checksumA);
  });

  it('allows a subsequent ingestion job to reference the same immutable source version', () => {
    const doc = KnowledgeDocument.create({
      title: 'Facility Emergency Protocol',
      tenantId: 'tenant_gym',
      uploadedBy: 'manager_1',
      initialVersion: {
        originalFileName: 'emergency.md',
        mimeType: DocumentFormat.MARKDOWN,
        fileSize: 4096,
        checksum: checksumA,
        storageKey: 'tenants/tenant_gym/knowledge_base/emergency.md',
      },
    });

    const v1 = doc.getCurrentVersion()!;

    // First job fails after exhausting attempts
    const job1 = IngestionJob.create({
      documentId: doc.id.value,
      documentVersionId: v1.id,
      tenantId: doc.tenantId,
      maxAttempts: 1,
    });
    job1.startValidation();
    job1.fail('DAEMON_OFFLINE', 'Ollama host daemon unpowered');
    expect(job1.canRetry()).toBe(false);

    // Later, when Ollama is back online, a new job is created for the EXACT same immutable version
    const job2 = IngestionJob.create({
      documentId: doc.id.value,
      documentVersionId: v1.id,
      tenantId: doc.tenantId,
    });

    job2.startValidation();
    job2.startProcessing();
    job2.startIndexing();
    job2.markReady();

    expect(job2.status).toBe(IngestionStatus.READY);
    expect(job2.documentVersionId).toBe(v1.id);
  });

  it('guarantees subsequent document versions do not mutate earlier versions', () => {
    const doc = KnowledgeDocument.create({
      title: 'Nutrition Guidelines',
      tenantId: 'tenant_1',
      uploadedBy: 'nutritionist',
    });

    const v1 = doc.addVersion({
      originalFileName: 'nutrition_2025.pdf',
      mimeType: DocumentFormat.PDF,
      fileSize: 100000,
      checksum: checksumA,
      storageKey: 'key_2025',
    });

    const v2 = doc.addVersion({
      originalFileName: 'nutrition_2026.pdf',
      mimeType: DocumentFormat.PDF,
      fileSize: 120000,
      checksum: checksumB,
      storageKey: 'key_2026',
    });

    // Invariant: v1 is still exactly as originally created
    const retrievedV1 = doc.getVersion(1);
    expect(retrievedV1?.id).toBe(v1.id);
    expect(retrievedV1?.originalFileName).toBe('nutrition_2025.pdf');
    expect(retrievedV1?.checksum).toBe(checksumA);
    expect(retrievedV1?.versionNumber).toBe(1);

    // Current version points to v2
    expect(doc.getCurrentVersion()?.id).toBe(v2.id);
    expect(doc.getCurrentVersion()?.versionNumber).toBe(2);
  });
});
