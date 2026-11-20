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
} from '../../../../domain/exceptions/knowledge-document.exceptions';

describe('AI-04.5 — Knowledge Chunk Persistence Integration', () => {
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
      metadata: { strategy: 'structure-aware', test: true },
    });
  };

  it('1. should persist chunks associated with an existing document version', async () => {
    if (!isDbAvailable) return;

    // Create and save parent document with initial version
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
    expect(retrieved[0]!.content).toContain('Primer fragmento');
    expect(retrieved[1]!.content).toContain('Segundo fragmento');
    expect(retrieved[0]!.provenance.sectionHierarchy).toEqual(['Manual', 'Sección A']);

    const count = await chunkRepo.countByVersionId(testTenant, verId);
    expect(count).toBe(2);
  });

  it('2. should idempotently replace existing chunks on reprocessing without leaving orphan fragments', async () => {
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

    // Initial run: 3 chunks
    const initialChunks = [
      createTestChunk({ docId: savedDoc.id.value, verId, seq: 0, content: 'Fragmento Inicial A' }),
      createTestChunk({ docId: savedDoc.id.value, verId, seq: 1, content: 'Fragmento Inicial B' }),
      createTestChunk({ docId: savedDoc.id.value, verId, seq: 2, content: 'Fragmento Inicial C' }),
    ];
    await chunkRepo.saveChunks(testTenant, savedDoc.id.value, verId, initialChunks);
    expect(await chunkRepo.countByVersionId(testTenant, verId)).toBe(3);

    // Reprocessing run: updated to 1 chunk
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

  it('3. should isolate chunks between historical version 1 and new version 2', async () => {
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

    // Add version 2 to document
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

    // Save chunks for version 1
    const v1Chunks = [
      createTestChunk({
        docId: savedDoc.id.value,
        verId: ver1Id,
        seq: 0,
        content: 'V1 Chunk Content',
      }),
    ];
    await chunkRepo.saveChunks(testTenant, savedDoc.id.value, ver1Id, v1Chunks);

    // Save chunks for version 2
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

    // Verify isolation
    const v1Results = await chunkRepo.findByVersionId(testTenant, ver1Id);
    const v2Results = await chunkRepo.findByVersionId(testTenant, ver2Id);

    expect(v1Results.length).toBe(1);
    expect(v1Results[0]!.content).toBe('V1 Chunk Content');

    expect(v2Results.length).toBe(2);
    expect(v2Results[0]!.content).toBe('V2 Chunk Content Alpha');
    expect(v2Results[1]!.content).toBe('V2 Chunk Content Beta');

    // Deleting v2 chunks must not affect v1
    const deletedCount = await chunkRepo.deleteByVersionId(testTenant, ver2Id);
    expect(deletedCount).toBe(2);

    expect(await chunkRepo.countByVersionId(testTenant, ver2Id)).toBe(0);
    expect(await chunkRepo.countByVersionId(testTenant, ver1Id)).toBe(1);
  });

  it('4. should reject cross-tenant chunk persistence', async () => {
    if (!isDbAvailable) return;

    const doc = KnowledgeDocument.create({
      tenantId: testTenant,
      title: 'Documento Privado Tenant A',
      uploadedBy: 'user-1',
      initialVersion: {
        originalFileName: 'privado.txt',
        mimeType: 'text/plain',
        fileSize: 100,
        checksum: '3333333333333333333333333333333333333333333333333333333333333333',
        storageKey: `tenants/${testTenant}/knowledge_base/privado.txt`,
        uploadedBy: 'user-1',
      },
    });

    const savedDoc = await docRepo.save(doc);
    const verId = savedDoc.currentVersionId!;

    const chunks = [
      createTestChunk({
        docId: savedDoc.id.value,
        verId,
        seq: 0,
        content: 'Intrusión Cross-Tenant',
      }),
    ];

    // Attempting to persist under otherTenant must throw UnauthorizedDocumentAccessException
    await expect(
      chunkRepo.saveChunks(otherTenant, savedDoc.id.value, verId, chunks),
    ).rejects.toThrow(UnauthorizedDocumentAccessException);
  });

  it('5. should reject chunk persistence for non-existent document or version', async () => {
    if (!isDbAvailable) return;

    const chunks = [
      createTestChunk({
        docId: 'non-existent-doc',
        verId: 'non-existent-ver',
        seq: 0,
        content: 'Texto',
      }),
    ];

    await expect(
      chunkRepo.saveChunks(testTenant, 'non-existent-doc', 'non-existent-ver', chunks),
    ).rejects.toThrow(DocumentNotFoundException);
  });
});
