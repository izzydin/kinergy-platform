import { PrismaClient } from '@prisma/client';
import { PrismaKnowledgeDocumentRepository } from '../repositories/prisma-knowledge-document.repository';
import { PrismaKnowledgeChunkRepository } from '../repositories/prisma-knowledge-chunk.repository';
import { KnowledgeDocument } from '../../../../domain/models/knowledge-document.aggregate';
import { DocumentChunk } from '../../../../domain/models/document-chunk.entity';
import { ChunkId } from '../../../../domain/value-objects/chunk-id.vo';
import { ChunkProvenance } from '../../../../domain/value-objects/chunk-provenance.vo';
import {
  DocumentNotFoundException,
  UnauthorizedDocumentAccessException,
  DocumentValidationException,
} from '../../../../domain/exceptions/knowledge-document.exceptions';

describe('AI-10.2-03 — Document and Chunk Ownership Integrity Integration', () => {
  let prisma: PrismaClient;
  let docRepo: PrismaKnowledgeDocumentRepository;
  let chunkRepo: PrismaKnowledgeChunkRepository;
  let isDbAvailable = false;

  const testTenant = `tenant_chunk_test_${Date.now()}`;
  const otherTenant = `tenant_chunk_other_${Date.now()}`;
  const checksum1 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  const checksum2 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

  beforeAll(async () => {
    prisma = new PrismaClient();
    try {
      await prisma.$connect();
      await prisma.$queryRawUnsafe('SELECT 1');
      isDbAvailable = true;
      docRepo = new PrismaKnowledgeDocumentRepository(prisma);
      chunkRepo = new PrismaKnowledgeChunkRepository(prisma);
    } catch {
      isDbAvailable = false;
    }
  });

  afterAll(async () => {
    if (isDbAvailable && prisma) {
      await prisma.knowledgeDocument
        .deleteMany({
          where: { tenantId: { in: [testTenant, otherTenant] } },
        })
        .catch(() => {});
      await prisma.$disconnect();
    }
  });

  const createTestChunk = (props: {
    docId: string;
    verId: string;
    seq: number;
    content: string;
    metadata?: Record<string, unknown>;
  }): DocumentChunk => {
    const chunkId = ChunkId.createDeterministic(props.docId, props.verId, props.seq, props.content);
    const provenance = ChunkProvenance.create({
      documentId: props.docId,
      documentVersionId: props.verId,
      chunkIndex: props.seq,
      pageNumber: 1,
      sectionHierarchy: ['Manual', 'Sección A'],
      sourceBlockIds: [`block-${props.seq}`],
      checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      configurationVersion: '1.0.0',
    });

    return DocumentChunk.create({
      id: chunkId,
      documentId: props.docId,
      documentVersionId: props.verId,
      sequence: props.seq,
      content: props.content,
      tokenCount: 25,
      language: 'es',
      provenance,
      metadata: props.metadata ?? { strategy: 'structure-aware', test: true },
    });
  };

  it('1. Scenario 1: Valid document-to-chunk relationship — persists chunks associated with an existing document', async () => {
    if (!isDbAvailable) return;

    const doc = KnowledgeDocument.create({
      tenantId: testTenant,
      title: 'Manual de Rehabilitación',
      uploadedBy: 'user-clinician-1',
      initialVersion: {
        originalFileName: 'rehab-manual.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        checksum: checksum1,
        storageKey: `tenants/${testTenant}/knowledge_base/manual.pdf`,
        uploadedBy: 'user-clinician-1',
      },
    });

    const savedDoc = await docRepo.save(doc);
    const verId = savedDoc.currentVersionId!;

    const chunks = [
      createTestChunk({
        docId: savedDoc.id.value,
        verId,
        seq: 0,
        content: 'Primer fragmento del manual de rehabilitación articular.',
      }),
      createTestChunk({
        docId: savedDoc.id.value,
        verId,
        seq: 1,
        content: 'Segundo fragmento con pautas de flexión asistida.',
      }),
    ];

    await chunkRepo.saveChunks(testTenant, savedDoc.id.value, verId, chunks);

    const retrieved = await chunkRepo.findByVersionId(testTenant, verId);
    expect(retrieved.length).toBe(2);
    expect(retrieved[0]!.sequence).toBe(0);
    expect(retrieved[1]!.sequence).toBe(1);
    expect(retrieved[0]!.documentId).toBe(savedDoc.id.value);
    expect(retrieved[1]!.documentId).toBe(savedDoc.id.value);
    expect(retrieved[0]!.content).toContain('Primer fragmento');
    expect(retrieved[1]!.content).toContain('Segundo fragmento');
    expect(retrieved[0]!.provenance.sectionHierarchy).toEqual(['Manual', 'Sección A']);

    const count = await chunkRepo.countByVersionId(testTenant, verId);
    expect(count).toBe(2);
  });

  it('2. Scenario 2: Valid document-version-to-chunk relationship — isolates chunks between historical versions', async () => {
    if (!isDbAvailable) return;

    const doc = KnowledgeDocument.create({
      tenantId: testTenant,
      title: 'Pautas de Tratamiento Progresivo',
      uploadedBy: 'user-clinician-1',
      initialVersion: {
        originalFileName: 'tratamiento-v1.txt',
        mimeType: 'text/plain',
        fileSize: 256,
        checksum: '1111111111111111111111111111111111111111111111111111111111111111',
        storageKey: `tenants/${testTenant}/knowledge_base/tratamiento-v1.txt`,
        uploadedBy: 'user-clinician-1',
      },
    });

    const savedDoc = await docRepo.save(doc);
    const ver1Id = savedDoc.currentVersionId!;

    const ver2 = savedDoc.addVersion({
      originalFileName: 'tratamiento-v2.txt',
      mimeType: 'text/plain',
      fileSize: 512,
      checksum: '2222222222222222222222222222222222222222222222222222222222222222',
      storageKey: `tenants/${testTenant}/knowledge_base/tratamiento-v2.txt`,
      uploadedBy: 'user-clinician-1',
    });
    await docRepo.save(savedDoc);
    const ver2Id = ver2.id;

    const v1Chunks = [
      createTestChunk({
        docId: savedDoc.id.value,
        verId: ver1Id,
        seq: 0,
        content: 'V1 Chunk Content',
      }),
    ];
    await chunkRepo.saveChunks(testTenant, savedDoc.id.value, ver1Id, v1Chunks);

    const v2Chunks = [
      createTestChunk({
        docId: savedDoc.id.value,
        verId: ver2Id,
        seq: 0,
        content: 'V2 Chunk Content Alpha',
      }),
      createTestChunk({
        docId: savedDoc.id.value,
        verId: ver2Id,
        seq: 1,
        content: 'V2 Chunk Content Beta',
      }),
    ];
    await chunkRepo.saveChunks(testTenant, savedDoc.id.value, ver2Id, v2Chunks);

    const v1Results = await chunkRepo.findByVersionId(testTenant, ver1Id);
    const v2Results = await chunkRepo.findByVersionId(testTenant, ver2Id);

    expect(v1Results.length).toBe(1);
    expect(v1Results[0]!.documentVersionId).toBe(ver1Id);
    expect(v1Results[0]!.content).toBe('V1 Chunk Content');

    expect(v2Results.length).toBe(2);
    expect(v2Results[0]!.documentVersionId).toBe(ver2Id);
    expect(v2Results[1]!.documentVersionId).toBe(ver2Id);

    const deletedCount = await chunkRepo.deleteByVersionId(testTenant, ver2Id);
    expect(deletedCount).toBe(2);

    expect(await chunkRepo.countByVersionId(testTenant, ver2Id)).toBe(0);
    expect(await chunkRepo.countByVersionId(testTenant, ver1Id)).toBe(1);
  });

  it('3. Scenario 3: Authoritative ownership preservation — chunk generation preserves tenantId, documentId, and versionId', async () => {
    if (!isDbAvailable) return;

    const doc = KnowledgeDocument.create({
      tenantId: testTenant,
      title: 'Preservación de Autoridad',
      uploadedBy: 'user-clinician-1',
      initialVersion: {
        originalFileName: 'auth-preserve.pdf',
        mimeType: 'application/pdf',
        fileSize: 512,
        checksum: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        storageKey: `tenants/${testTenant}/knowledge_base/auth-preserve.pdf`,
        uploadedBy: 'user-clinician-1',
      },
    });

    const savedDoc = await docRepo.save(doc);
    const verId = savedDoc.currentVersionId!;

    const chunk = createTestChunk({
      docId: savedDoc.id.value,
      verId,
      seq: 0,
      content: 'Contenido verificado con procedencia inmutable',
    });

    await chunkRepo.saveChunks(testTenant, savedDoc.id.value, verId, [chunk]);

    const persisted = await chunkRepo.findById(testTenant, chunk.id.value);
    expect(persisted).not.toBeNull();
    expect(persisted!.documentId).toBe(savedDoc.id.value);
    expect(persisted!.documentVersionId).toBe(verId);
    expect(persisted!.provenance.documentId).toBe(savedDoc.id.value);
    expect(persisted!.provenance.documentVersionId).toBe(verId);
  });

  it('4. Scenario 4: Reprocessing preserves ownership without orphan chunks — idempotent replacement leaves no old chunks', async () => {
    if (!isDbAvailable) return;

    const doc = KnowledgeDocument.create({
      tenantId: testTenant,
      title: 'Protocolo de Evaluación Postural',
      uploadedBy: 'user-clinician-1',
      initialVersion: {
        originalFileName: 'eval-postural.md',
        mimeType: 'text/markdown',
        fileSize: 512,
        checksum: checksum2,
        storageKey: `tenants/${testTenant}/knowledge_base/eval.md`,
        uploadedBy: 'user-clinician-1',
      },
    });

    const savedDoc = await docRepo.save(doc);
    const verId = savedDoc.currentVersionId!;

    const initialChunks = [
      createTestChunk({ docId: savedDoc.id.value, verId, seq: 0, content: 'Fragmento Inicial A' }),
      createTestChunk({ docId: savedDoc.id.value, verId, seq: 1, content: 'Fragmento Inicial B' }),
      createTestChunk({ docId: savedDoc.id.value, verId, seq: 2, content: 'Fragmento Inicial C' }),
    ];
    await chunkRepo.saveChunks(testTenant, savedDoc.id.value, verId, initialChunks);
    expect(await chunkRepo.countByVersionId(testTenant, verId)).toBe(3);

    const reprocessedChunks = [
      createTestChunk({
        docId: savedDoc.id.value,
        verId,
        seq: 0,
        content: 'Fragmento Reprocesado Consolidado',
      }),
    ];
    await chunkRepo.saveChunks(testTenant, savedDoc.id.value, verId, reprocessedChunks);

    const afterReprocess = await chunkRepo.findByVersionId(testTenant, verId);
    expect(afterReprocess.length).toBe(1);
    expect(afterReprocess[0]!.content).toBe('Fragmento Reprocesado Consolidado');
  });

  it('5. Scenario 5: Attempted chunk ownership metadata forgery — strips client-supplied authorization keys', async () => {
    if (!isDbAvailable) return;

    const doc = KnowledgeDocument.create({
      tenantId: testTenant,
      title: 'Doc Forgery Test',
      uploadedBy: 'user-clinician-1',
      initialVersion: {
        originalFileName: 'forgery.txt',
        mimeType: 'text/plain',
        fileSize: 100,
        checksum: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        storageKey: `tenants/${testTenant}/knowledge_base/forgery.txt`,
        uploadedBy: 'user-clinician-1',
      },
    });
    const savedDoc = await docRepo.save(doc);
    const verId = savedDoc.currentVersionId!;

    // Attempt to inject forbidden authorization metadata keys into chunk
    const forgedMetadata = {
      tenantId: 'rogue-tenant',
      tenant_id: 'rogue-tenant-2',
      visibilityScope: 'PUBLIC_UNIVERSAL',
      visibility_scope: 'GLOBAL',
      uploadedBy: 'admin-spoofed',
      roles: ['SUPERADMIN'],
      permissions: ['*'],
      deletedAt: null,
      legitimateKey: 'valid-clinical-topic',
    };

    const forgedChunk = createTestChunk({
      docId: savedDoc.id.value,
      verId,
      seq: 0,
      content: 'Contenido con intento de forja de metadatos de autorización',
      metadata: forgedMetadata,
    });

    // Verify domain entity sanitization stripped all forbidden keys
    expect(forgedChunk.metadata).not.toHaveProperty('tenantId');
    expect(forgedChunk.metadata).not.toHaveProperty('tenant_id');
    expect(forgedChunk.metadata).not.toHaveProperty('visibilityScope');
    expect(forgedChunk.metadata).not.toHaveProperty('visibility_scope');
    expect(forgedChunk.metadata).not.toHaveProperty('uploadedBy');
    expect(forgedChunk.metadata).not.toHaveProperty('roles');
    expect(forgedChunk.metadata).not.toHaveProperty('permissions');
    expect(forgedChunk.metadata).not.toHaveProperty('deletedAt');
    expect(forgedChunk.metadata).toHaveProperty('legitimateKey', 'valid-clinical-topic');

    // Persist and retrieve from database to verify persistence preserves sanitized state
    await chunkRepo.saveChunks(testTenant, savedDoc.id.value, verId, [forgedChunk]);
    const retrieved = await chunkRepo.findById(testTenant, forgedChunk.id.value);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.metadata).not.toHaveProperty('tenantId');
    expect(retrieved!.metadata).not.toHaveProperty('visibilityScope');
    expect(retrieved!.metadata).toHaveProperty('legitimateKey', 'valid-clinical-topic');
  });

  it('6. Scenario 6: Non-existent document reference rejected — throws DocumentNotFoundException', async () => {
    if (!isDbAvailable) return;

    const chunks = [
      createTestChunk({
        docId: 'non-existent-doc-id',
        verId: 'non-existent-ver-id',
        seq: 0,
        content: 'Texto huérfano',
      }),
    ];

    await expect(
      chunkRepo.saveChunks(testTenant, 'non-existent-doc-id', 'non-existent-ver-id', chunks),
    ).rejects.toThrow(DocumentNotFoundException);
  });

  it('7. Scenario 7: Non-existent version reference rejected — throws DocumentNotFoundException', async () => {
    if (!isDbAvailable) return;

    const doc = KnowledgeDocument.create({
      tenantId: testTenant,
      title: 'Doc Existente con Version Falsa',
      uploadedBy: 'user-1',
      initialVersion: {
        originalFileName: 'file.txt',
        mimeType: 'text/plain',
        fileSize: 100,
        checksum: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
        storageKey: `tenants/${testTenant}/knowledge_base/file.txt`,
        uploadedBy: 'user-1',
      },
    });
    const savedDoc = await docRepo.save(doc);

    const chunks = [
      createTestChunk({
        docId: savedDoc.id.value,
        verId: 'version-que-no-existe',
        seq: 0,
        content: 'Texto con versión falsa',
      }),
    ];

    await expect(
      chunkRepo.saveChunks(testTenant, savedDoc.id.value, 'version-que-no-existe', chunks),
    ).rejects.toThrow(DocumentNotFoundException);
  });

  it('8. Scenario 8: Cross-document chunk provenance mismatch rejected — throws DocumentValidationException', async () => {
    if (!isDbAvailable) return;

    const doc = KnowledgeDocument.create({
      tenantId: testTenant,
      title: 'Doc Provenance Check',
      uploadedBy: 'user-1',
      initialVersion: {
        originalFileName: 'prov.txt',
        mimeType: 'text/plain',
        fileSize: 100,
        checksum: 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
        storageKey: `tenants/${testTenant}/knowledge_base/prov.txt`,
        uploadedBy: 'user-1',
      },
    });
    const savedDoc = await docRepo.save(doc);
    const verId = savedDoc.currentVersionId!;

    // Chunk claims to belong to a different document
    const mismatchedChunkDoc = createTestChunk({
      docId: 'other-doc-id-1234',
      verId,
      seq: 0,
      content: 'Chunk provenance mismatch documentId',
    });

    await expect(
      chunkRepo.saveChunks(testTenant, savedDoc.id.value, verId, [mismatchedChunkDoc]),
    ).rejects.toThrow(DocumentValidationException);

    // Chunk claims to belong to a different version
    const mismatchedChunkVer = createTestChunk({
      docId: savedDoc.id.value,
      verId: 'other-ver-id-5678',
      seq: 0,
      content: 'Chunk provenance mismatch versionId',
    });

    await expect(
      chunkRepo.saveChunks(testTenant, savedDoc.id.value, verId, [mismatchedChunkVer]),
    ).rejects.toThrow(DocumentValidationException);
  });

  it('9. Scenario 9: Soft-deleted document chunk persistence rejection — throws DocumentNotFoundException', async () => {
    if (!isDbAvailable) return;

    const doc = KnowledgeDocument.create({
      tenantId: testTenant,
      title: 'Doc Soft Deleted',
      uploadedBy: 'user-1',
      initialVersion: {
        originalFileName: 'soft-del.txt',
        mimeType: 'text/plain',
        fileSize: 100,
        checksum: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        storageKey: `tenants/${testTenant}/knowledge_base/soft-del.txt`,
        uploadedBy: 'user-1',
      },
    });
    const savedDoc = await docRepo.save(doc);
    const verId = savedDoc.currentVersionId!;

    // Soft-delete the document
    savedDoc.softDelete('user-1');
    await docRepo.save(savedDoc);

    const chunks = [
      createTestChunk({
        docId: savedDoc.id.value,
        verId,
        seq: 0,
        content: 'Intento de persistir chunk en documento eliminado lógicamente',
      }),
    ];

    await expect(
      chunkRepo.saveChunks(testTenant, savedDoc.id.value, verId, chunks),
    ).rejects.toThrow(DocumentNotFoundException);
  });

  it('10. Scenario 10: Chunk findById enforces tenant isolation — cross-tenant retrieval returns null', async () => {
    if (!isDbAvailable) return;

    const doc = KnowledgeDocument.create({
      tenantId: testTenant,
      title: 'Doc Tenant Isolation',
      uploadedBy: 'user-1',
      initialVersion: {
        originalFileName: 'tenant-iso.txt',
        mimeType: 'text/plain',
        fileSize: 100,
        checksum: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        storageKey: `tenants/${testTenant}/knowledge_base/tenant-iso.txt`,
        uploadedBy: 'user-1',
      },
    });
    const savedDoc = await docRepo.save(doc);
    const verId = savedDoc.currentVersionId!;

    const chunk = createTestChunk({
      docId: savedDoc.id.value,
      verId,
      seq: 0,
      content: 'Contenido privado tenant test',
    });

    await chunkRepo.saveChunks(testTenant, savedDoc.id.value, verId, [chunk]);

    // Authorized tenant can find the chunk
    const authorizedResult = await chunkRepo.findById(testTenant, chunk.id.value);
    expect(authorizedResult).not.toBeNull();
    expect(authorizedResult!.id.value).toBe(chunk.id.value);

    // Cross-tenant retrieval with otherTenant returns null
    const crossTenantResult = await chunkRepo.findById(otherTenant, chunk.id.value);
    expect(crossTenantResult).toBeNull();

    // Cross-tenant saveChunks throws UnauthorizedDocumentAccessException
    await expect(
      chunkRepo.saveChunks(otherTenant, savedDoc.id.value, verId, [chunk]),
    ).rejects.toThrow(UnauthorizedDocumentAccessException);
  });
});
