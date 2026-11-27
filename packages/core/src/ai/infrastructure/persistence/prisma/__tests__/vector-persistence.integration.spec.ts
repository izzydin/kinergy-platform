import { PrismaClient } from '@prisma/client';
import { PrismaVectorStoreRepository } from '../repositories/prisma-vector-store.repository';
import { PrismaIndexGenerationRepository } from '../repositories/prisma-index-generation.repository';
import { PrismaKnowledgeDocumentRepository } from '../repositories/prisma-knowledge-document.repository';
import { PrismaKnowledgeChunkRepository } from '../repositories/prisma-knowledge-chunk.repository';
import { KnowledgeDocument } from '../../../../domain/models/knowledge-document.aggregate';
import { DocumentChunk } from '../../../../domain/models/document-chunk.entity';
import { DocumentEmbedding } from '../../../../domain/models/document-embedding.entity';
import { IndexGeneration } from '../../../../domain/models/index-generation.aggregate';
import { EmbeddingProfile } from '../../../../domain/value-objects/embedding-profile.vo';
import { ChunkId } from '../../../../domain/value-objects/chunk-id.vo';
import { ChunkProvenance } from '../../../../domain/value-objects/chunk-provenance.vo';
import { IndexGenerationStatus } from '../../../../domain/enums/index-generation-status.enum';
import {
  EmbeddingValidationException,
  DuplicateActiveIndexGenerationException,
} from '../../../../domain/exceptions/vector-indexing.exceptions';

describe('AI-05.2 — PostgreSQL pgvector & Vector Persistence Integration', () => {
  let prisma: PrismaClient;
  let vectorStore: PrismaVectorStoreRepository;
  let generationRepo: PrismaIndexGenerationRepository;
  let docRepo: PrismaKnowledgeDocumentRepository;
  let chunkRepo: PrismaKnowledgeChunkRepository;
  let isDbAvailable = false;

  const testTenant = `tenant_vector_test_${Date.now()}`;
  const checksum = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  // Helper to generate normalized 1024-dimensional vectors
  const createNormalized1024Vector = (seed: number): number[] => {
    const raw = new Array(1024).fill(0).map((_, i) => Math.sin(seed * (i + 1)));
    const norm = Math.sqrt(raw.reduce((acc, val) => acc + val * val, 0));
    return raw.map((val) => val / norm);
  };

  beforeAll(async () => {
    prisma = new PrismaClient();
    try {
      await prisma.$connect();
      await prisma.$queryRawUnsafe('SELECT 1');
      isDbAvailable = true;
      vectorStore = new PrismaVectorStoreRepository(prisma);
      generationRepo = new PrismaIndexGenerationRepository(prisma);
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
          where: { tenantId: testTenant },
        })
        .catch(() => {});
      await prisma.indexGeneration
        .deleteMany({
          where: { tenantId: testTenant },
        })
        .catch(() => {});
      await prisma.embeddingProfile
        .deleteMany({
          where: { profileId: { contains: 'test_prof' } },
        })
        .catch(() => {});
      await prisma.$disconnect();
    }
  });

  it('1. should verify pgvector extension availability and version 0.8.7', async () => {
    if (!isDbAvailable) return;

    const rows = await prisma.$queryRawUnsafe<Array<{ extname: string; extversion: string }>>(
      `SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';`,
    );

    expect(rows.length).toBe(1);
    expect(rows[0]?.extname).toBe('vector');
    expect(rows[0]?.extversion).toBe('0.8.7');
  });

  it('2. should persist and retrieve a valid 1024-dimensional DocumentEmbedding', async () => {
    if (!isDbAvailable) return;

    // A. Create document and version
    const doc = KnowledgeDocument.create({
      tenantId: testTenant,
      title: 'Manual de Kinesiología y Readaptación',
      uploadedBy: 'usr_admin',
    });
    const ver = doc.addVersion({
      checksum,
      storageKey: 's3://bucket/manual.pdf',
      fileSize: 10240,
      mimeType: 'application/pdf',
      originalFileName: 'manual.pdf',
      uploadedBy: 'usr_admin',
    });
    await docRepo.save(doc);

    // B. Create chunk
    const chunkId = ChunkId.createDeterministic(
      doc.id.value,
      ver.id,
      0,
      'Introducción a la fisioterapia',
    );
    const chunk = DocumentChunk.create({
      id: chunkId,
      documentId: doc.id.value,
      documentVersionId: ver.id,
      sequence: 0,
      content: 'Introducción a la fisioterapia',
      tokenCount: 4,
      provenance: ChunkProvenance.create({
        documentId: doc.id.value,
        documentVersionId: ver.id,
        chunkIndex: 0,
        pageNumber: 1,
        sectionHierarchy: ['Manual'],
        checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        configurationVersion: '1.0.0',
      }),
    });
    await chunkRepo.saveChunks(testTenant, doc.id.value, ver.id, [chunk]);

    // C. Create profile and index generation
    const profile = EmbeddingProfile.bgeM3DenseDefault();
    const generation = IndexGeneration.create({
      tenantId: testTenant,
      generationNumber: 1,
      profile,
      targetChunkCount: 1,
    });
    generation.startBuilding();
    await generationRepo.save(generation);

    // D. Persist embedding
    const testVector = createNormalized1024Vector(1.0);
    const embedding = DocumentEmbedding.create({
      chunkId,
      documentId: doc.id.value,
      documentVersionId: ver.id,
      indexGenerationId: generation.id,
      profile,
      vector: testVector,
      contentFingerprint: 'sha256:fingerprint_001',
    });

    await vectorStore.save(embedding);

    // E. Retrieve embedding and verify
    const found = await vectorStore.findByChunkId(chunkId.value, generation.id.value);
    expect(found).not.toBeNull();
    expect(found?.dimensions).toBe(1024);
    expect(found?.documentId).toBe(doc.id.value);
    expect(found?.documentVersionId).toBe(ver.id);
    expect(found?.contentFingerprint).toBe('sha256:fingerprint_001');

    // Verify float values precision
    const foundVals = found?.vector.values ?? [];
    expect(foundVals.length).toBe(1024);
    expect(foundVals[0]).toBeCloseTo(testVector[0]!, 5);
    expect(foundVals[1023]).toBeCloseTo(testVector[1023]!, 5);
  });

  it('3. should reject incompatible vector dimensions at both domain and database levels', async () => {
    if (!isDbAvailable) return;

    const profile = EmbeddingProfile.bgeM3DenseDefault();

    // A. Domain-level rejection
    expect(() =>
      DocumentEmbedding.create({
        chunkId: ChunkId.create('chk_any'),
        documentId: 'doc_1',
        documentVersionId: 'ver_1',
        indexGenerationId: 'idxgen_1',
        profile,
        vector: [0.1, 0.2, 0.3], // 3 dimensions instead of 1024
        contentFingerprint: 'sha256:test',
      }),
    ).toThrow(EmbeddingValidationException);

    // B. Database-level rejection on vector(1024) column type
    const rawDoc = (await prisma.knowledgeDocument.findFirst({ where: { tenantId: testTenant } }))!;
    const chunk = (await prisma.knowledgeChunk.findFirst({ where: { tenantId: testTenant } }))!;
    const gen = (await prisma.indexGeneration.findFirst({ where: { tenantId: testTenant } }))!;

    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "document_embeddings" (
          "id", "chunk_id", "document_id", "document_version_id",
          "index_generation_id", "profile_id", "dimensions",
          "embedding", "content_fingerprint", "created_at"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector, $9, $10);`,
        `emb_invalid_dim_${Date.now()}`,
        chunk.id,
        rawDoc.id,
        chunk.documentVersionId,
        gen.id,
        profile.profileId,
        1024,
        '[0.1, 0.2]', // 2 dimensions into vector(1024)
        'sha256:invalid',
        new Date(),
      ),
    ).rejects.toThrow();

    // C. Database check constraint rejection (dimensions != 1024)
    const valid1024Literal = `[${createNormalized1024Vector(2.0).join(',')}]`;
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "document_embeddings" (
          "id", "chunk_id", "document_id", "document_version_id",
          "index_generation_id", "profile_id", "dimensions",
          "embedding", "content_fingerprint", "created_at"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector, $9, $10);`,
        `emb_chk_dim_${Date.now()}`,
        chunk.id,
        rawDoc.id,
        chunk.documentVersionId,
        gen.id,
        profile.profileId,
        768, // Violates CHECK (dimensions = 1024)
        valid1024Literal,
        'sha256:invalid',
        new Date(),
      ),
    ).rejects.toThrow(/chk_document_embeddings_dimensions/);
  });

  it('4. should execute cosine distance similarity search with accurate rank ordering', async () => {
    if (!isDbAvailable) return;

    const gen = (await prisma.indexGeneration.findFirst({ where: { tenantId: testTenant } }))!;

    // Query with identical vector to the indexed chunk (seed 1.0)
    const queryVector = createNormalized1024Vector(1.0);
    const results = await vectorStore.similaritySearch(queryVector, {
      tenantId: testTenant,
      generationId: gen.id,
      limit: 10,
    });

    expect(results.length).toBeGreaterThanOrEqual(1);
    const topMatch = results[0]!;
    // Cosine distance of identical vector should be ~0.0, similarity ~1.0
    expect(topMatch.distance).toBeCloseTo(0.0, 4);
    expect(topMatch.similarity).toBeCloseTo(1.0, 4);
  });

  it('5. should enforce the single active generation invariant per tenant via partial unique index', async () => {
    if (!isDbAvailable) return;

    const profile = EmbeddingProfile.bgeM3DenseDefault();

    // Create Gen 1 in ACTIVE status
    const gen1 = IndexGeneration.create({
      tenantId: testTenant,
      generationNumber: 10,
      profile,
    });
    gen1.startBuilding();
    gen1.recordProgress(1);
    gen1.startValidation();
    gen1.activate();
    await generationRepo.save(gen1);

    // Create Gen 2 also attempting to be ACTIVE for the same tenant
    const gen2 = IndexGeneration.create({
      tenantId: testTenant,
      generationNumber: 11,
      profile,
    });
    gen2.startBuilding();
    gen2.recordProgress(1);
    gen2.startValidation();
    gen2.activate();

    // Saving gen2 directly as ACTIVE without retiring gen1 must violate the database unique index
    await expect(generationRepo.save(gen2)).rejects.toThrow(
      DuplicateActiveIndexGenerationException,
    );
  });

  it('6. should execute atomic generation promotion (retiring old, activating new)', async () => {
    if (!isDbAvailable) return;

    const profile = EmbeddingProfile.bgeM3DenseDefault();

    // Create Gen 2 in BUILDING status
    const gen2 = IndexGeneration.create({
      tenantId: testTenant,
      generationNumber: 20,
      profile,
    });
    gen2.startBuilding();
    gen2.recordProgress(5);
    await generationRepo.save(gen2);

    // Atomically promote Gen 2
    await generationRepo.promoteGeneration(gen2.id.value, testTenant);

    // Verify Gen 2 is ACTIVE
    const activeGen = await generationRepo.findActiveByTenantId(testTenant);
    expect(activeGen).not.toBeNull();
    expect(activeGen?.id.value).toBe(gen2.id.value);
    expect(activeGen?.status).toBe(IndexGenerationStatus.ACTIVE);

    // Verify previous active gen (Gen 1 / Gen 10) was RETIRED
    const gen1Record = await generationRepo.findById(
      (await prisma.indexGeneration.findFirst({
        where: { tenantId: testTenant, generationNumber: 10 },
      }))!.id,
    );
    expect(gen1Record?.status).toBe(IndexGenerationStatus.RETIRED);
  });

  it('7. should cascade delete embeddings when parent knowledge document is deleted', async () => {
    if (!isDbAvailable) return;

    // Create isolated document and embedding
    const isolatedDoc = KnowledgeDocument.create({
      tenantId: testTenant,
      title: 'Document to be deleted',
      uploadedBy: 'usr_admin',
    });
    const ver = isolatedDoc.addVersion({
      checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b856',
      storageKey: 's3://bucket/del.pdf',
      fileSize: 5000,
      mimeType: 'application/pdf',
      originalFileName: 'del.pdf',
      uploadedBy: 'usr_admin',
    });
    await docRepo.save(isolatedDoc);

    const chunkId = ChunkId.createDeterministic(
      isolatedDoc.id.value,
      ver.id,
      0,
      'Temporal content',
    );
    const chunk = DocumentChunk.create({
      id: chunkId,
      documentId: isolatedDoc.id.value,
      documentVersionId: ver.id,
      sequence: 0,
      content: 'Temporal content',
      tokenCount: 2,
      provenance: ChunkProvenance.create({
        documentId: isolatedDoc.id.value,
        documentVersionId: ver.id,
        chunkIndex: 0,
        pageNumber: 1,
        sectionHierarchy: ['Temporal'],
        checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b856',
        configurationVersion: '1.0.0',
      }),
    });
    await chunkRepo.saveChunks(testTenant, isolatedDoc.id.value, ver.id, [chunk]);

    const activeGen = (await generationRepo.findActiveByTenantId(testTenant))!;
    const embedding = DocumentEmbedding.create({
      chunkId,
      documentId: isolatedDoc.id.value,
      documentVersionId: ver.id,
      indexGenerationId: activeGen.id,
      profile: activeGen.profile,
      vector: createNormalized1024Vector(99.0),
      contentFingerprint: 'sha256:temp',
    });
    await vectorStore.save(embedding);

    // Verify it exists
    const beforeDel = await vectorStore.findByChunkId(chunkId.value, activeGen.id.value);
    expect(beforeDel).not.toBeNull();

    // Delete document at database level
    await prisma.knowledgeDocument.delete({ where: { id: isolatedDoc.id.value } });

    // Verify embedding was cascade-deleted
    const afterDel = await vectorStore.findByChunkId(chunkId.value, activeGen.id.value);
    expect(afterDel).toBeNull();
  });

  it('8. should safely handle duplicate embedding upserts for the same chunk and generation', async () => {
    if (!isDbAvailable) return;

    const doc = (await prisma.knowledgeDocument.findFirst({ where: { tenantId: testTenant } }))!;
    const chunk = (await prisma.knowledgeChunk.findFirst({ where: { tenantId: testTenant } }))!;
    const gen = (await prisma.indexGeneration.findFirst({ where: { tenantId: testTenant } }))!;
    const profile = EmbeddingProfile.bgeM3DenseDefault();

    const originalEmbedding = DocumentEmbedding.create({
      chunkId: ChunkId.create(chunk.id),
      documentId: doc.id,
      documentVersionId: chunk.documentVersionId,
      indexGenerationId: gen.id,
      profile,
      vector: createNormalized1024Vector(1.0),
      contentFingerprint: 'sha256:original',
    });
    await vectorStore.save(originalEmbedding);

    // Save updated embedding for the exact same chunk and generation (re-embedding)
    const updatedEmbedding = DocumentEmbedding.create({
      chunkId: ChunkId.create(chunk.id),
      documentId: doc.id,
      documentVersionId: chunk.documentVersionId,
      indexGenerationId: gen.id,
      profile,
      vector: createNormalized1024Vector(2.0),
      contentFingerprint: 'sha256:updated_fingerprint',
    });
    await vectorStore.save(updatedEmbedding);

    // Retrieve and verify it was updated without throwing unique constraint error
    const retrieved = await vectorStore.findByChunkId(chunk.id, gen.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.contentFingerprint).toBe('sha256:updated_fingerprint');
    expect(retrieved?.vector.values[0]).toBeCloseTo(createNormalized1024Vector(2.0)[0]!, 5);
  });

  it('9. should roll back batch persistence transaction on invalid element failure', async () => {
    if (!isDbAvailable) return;

    const doc = (await prisma.knowledgeDocument.findFirst({ where: { tenantId: testTenant } }))!;
    const chunk = (await prisma.knowledgeChunk.findFirst({ where: { tenantId: testTenant } }))!;
    const gen = (await prisma.indexGeneration.findFirst({ where: { tenantId: testTenant } }))!;
    const profile = EmbeddingProfile.bgeM3DenseDefault();

    const validEmbedding = DocumentEmbedding.create({
      chunkId: ChunkId.create(chunk.id),
      documentId: doc.id,
      documentVersionId: chunk.documentVersionId,
      indexGenerationId: gen.id,
      profile,
      vector: createNormalized1024Vector(10.0),
      contentFingerprint: 'sha256:valid_in_batch',
    });

    // Mock an invalid second embedding in the batch by passing incompatible dimensions
    const invalidEmbedding = {
      ...validEmbedding,
      id: { value: 'emb_fail_sim' },
      dimensions: 768,
      vector: { values: new Array(768).fill(0), dimensions: 768 },
    } as unknown as DocumentEmbedding;

    await expect(vectorStore.saveBatch([validEmbedding, invalidEmbedding])).rejects.toThrow(
      EmbeddingValidationException,
    );
  });

  describe('AI-10.2-04: Vector Authorization Metadata & Provenance Integrity Tests', () => {
    it('10. Scenario 1: Vector persistence includes required provenance', async () => {
      if (!isDbAvailable) return;

      const doc = (await prisma.knowledgeDocument.findFirst({ where: { tenantId: testTenant } }))!;
      const chunk = (await prisma.knowledgeChunk.findFirst({ where: { tenantId: testTenant } }))!;
      const gen = (await prisma.indexGeneration.findFirst({ where: { tenantId: testTenant } }))!;
      const profile = EmbeddingProfile.bgeM3DenseDefault();

      const embedding = DocumentEmbedding.create({
        chunkId: ChunkId.create(chunk.id),
        documentId: doc.id,
        documentVersionId: chunk.documentVersionId,
        indexGenerationId: gen.id,
        profile,
        vector: createNormalized1024Vector(50.0),
        contentFingerprint: 'sha256:provenance_check',
      });

      expect(embedding.chunkId.value).toBe(chunk.id);
      expect(embedding.documentId).toBe(doc.id);
      expect(embedding.documentVersionId).toBe(chunk.documentVersionId);
      expect(embedding.indexGenerationId.value).toBe(gen.id);
      expect(embedding.contentFingerprint).toBe('sha256:provenance_check');
      expect(embedding.dimensions).toBe(1024);

      await vectorStore.save(embedding);
      const persisted = await vectorStore.findByChunkId(chunk.id, gen.id);
      expect(persisted).not.toBeNull();
      expect(persisted!.documentId).toBe(doc.id);
      expect(persisted!.documentVersionId).toBe(chunk.documentVersionId);
    });

    it('11. Scenario 2: Vector provenance matches its source chunk and document', async () => {
      if (!isDbAvailable) return;

      const doc = (await prisma.knowledgeDocument.findFirst({ where: { tenantId: testTenant } }))!;
      const chunk = (await prisma.knowledgeChunk.findFirst({ where: { tenantId: testTenant } }))!;
      const gen = (await prisma.indexGeneration.findFirst({ where: { tenantId: testTenant } }))!;

      const retrieved = await vectorStore.findByChunkId(chunk.id, gen.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.chunkId.value).toBe(chunk.id);
      expect(retrieved!.documentId).toBe(doc.id);
      expect(retrieved!.documentVersionId).toBe(chunk.documentVersionId);
    });

    it('12. Scenario 3: Forged metadata cannot alter vector scope', async () => {
      if (!isDbAvailable) return;

      const chunk = (await prisma.knowledgeChunk.findFirst({ where: { tenantId: testTenant } }))!;
      const gen = (await prisma.indexGeneration.findFirst({ where: { tenantId: testTenant } }))!;
      const profile = EmbeddingProfile.bgeM3DenseDefault();

      // Forged embedding claims to belong to a fake/foreign document
      const forgedEmbedding = DocumentEmbedding.create({
        chunkId: ChunkId.create(chunk.id),
        documentId: 'forged-foreign-doc-id',
        documentVersionId: chunk.documentVersionId,
        indexGenerationId: gen.id,
        profile,
        vector: createNormalized1024Vector(51.0),
        contentFingerprint: 'sha256:forged',
      });

      await expect(vectorStore.save(forgedEmbedding)).rejects.toThrow(EmbeddingValidationException);
    });

    it('13. Scenario 4: Re-embedding preserves ownership and version relationships', async () => {
      if (!isDbAvailable) return;

      const doc = (await prisma.knowledgeDocument.findFirst({ where: { tenantId: testTenant } }))!;
      const chunk = (await prisma.knowledgeChunk.findFirst({ where: { tenantId: testTenant } }))!;
      const gen = (await prisma.indexGeneration.findFirst({ where: { tenantId: testTenant } }))!;
      const profile = EmbeddingProfile.bgeM3DenseDefault();

      // Re-embed with updated vector
      const reEmbedding = DocumentEmbedding.create({
        chunkId: ChunkId.create(chunk.id),
        documentId: doc.id,
        documentVersionId: chunk.documentVersionId,
        indexGenerationId: gen.id,
        profile,
        vector: createNormalized1024Vector(77.0),
        contentFingerprint: 'sha256:reembedded_v2',
      });

      await vectorStore.save(reEmbedding);

      const retrieved = await vectorStore.findByChunkId(chunk.id, gen.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.contentFingerprint).toBe('sha256:reembedded_v2');
      expect(retrieved!.documentId).toBe(doc.id);
      expect(retrieved!.documentVersionId).toBe(chunk.documentVersionId);
    });

    it('14. Scenario 5: Missing metadata fails closed', async () => {
      if (!isDbAvailable) return;

      const gen = (await prisma.indexGeneration.findFirst({ where: { tenantId: testTenant } }))!;
      const queryVector = createNormalized1024Vector(1.0);

      // Missing tenantId fails closed with exception
      await expect(
        vectorStore.similaritySearch(queryVector, {
          tenantId: '',
          generationId: gen.id,
          limit: 5,
        }),
      ).rejects.toThrow(EmbeddingValidationException);

      // Whitespace tenantId fails closed
      await expect(
        vectorStore.similaritySearch(queryVector, {
          tenantId: '   ',
          generationId: gen.id,
          limit: 5,
        }),
      ).rejects.toThrow(EmbeddingValidationException);
    });

    it('15. Scenario 6: Inconsistent metadata fails closed', async () => {
      if (!isDbAvailable) return;

      const doc = (await prisma.knowledgeDocument.findFirst({ where: { tenantId: testTenant } }))!;
      const chunk = (await prisma.knowledgeChunk.findFirst({ where: { tenantId: testTenant } }))!;
      const gen = (await prisma.indexGeneration.findFirst({ where: { tenantId: testTenant } }))!;
      const profile = EmbeddingProfile.bgeM3DenseDefault();

      // Mismatched versionId between chunk and embedding
      const inconsistentEmbedding = DocumentEmbedding.create({
        chunkId: ChunkId.create(chunk.id),
        documentId: doc.id,
        documentVersionId: 'mismatched-version-id-999',
        indexGenerationId: gen.id,
        profile,
        vector: createNormalized1024Vector(52.0),
        contentFingerprint: 'sha256:inconsistent',
      });

      await expect(vectorStore.save(inconsistentEmbedding)).rejects.toThrow(
        EmbeddingValidationException,
      );
    });

    it('16. Scenario 7: Deleted documents cannot be retrieved through stale vectors', async () => {
      if (!isDbAvailable) return;

      // Create a document, chunk, and embedding specifically for soft-delete test
      const delDoc = KnowledgeDocument.create({
        tenantId: testTenant,
        title: 'Doc to be soft-deleted',
        uploadedBy: 'usr_admin',
      });
      const delVer = delDoc.addVersion({
        checksum: '1111111111111111111111111111111111111111111111111111111111111199',
        storageKey: 's3://bucket/del-soft.pdf',
        fileSize: 4000,
        mimeType: 'application/pdf',
        originalFileName: 'del-soft.pdf',
        uploadedBy: 'usr_admin',
      });
      await docRepo.save(delDoc);

      const delChunkId = ChunkId.createDeterministic(
        delDoc.id.value,
        delVer.id,
        0,
        'Contenido que será eliminado lógicamente',
      );
      const delChunk = DocumentChunk.create({
        id: delChunkId,
        documentId: delDoc.id.value,
        documentVersionId: delVer.id,
        sequence: 0,
        content: 'Contenido que será eliminado lógicamente',
        tokenCount: 5,
        provenance: ChunkProvenance.create({
          documentId: delDoc.id.value,
          documentVersionId: delVer.id,
          chunkIndex: 0,
          pageNumber: 1,
          checksum: '1111111111111111111111111111111111111111111111111111111111111199',
          configurationVersion: '1.0.0',
        }),
      });
      await chunkRepo.saveChunks(testTenant, delDoc.id.value, delVer.id, [delChunk]);

      const activeGen = (await generationRepo.findActiveByTenantId(testTenant))!;
      const delVector = createNormalized1024Vector(88.0);
      const delEmbedding = DocumentEmbedding.create({
        chunkId: delChunkId,
        documentId: delDoc.id.value,
        documentVersionId: delVer.id,
        indexGenerationId: activeGen.id,
        profile: activeGen.profile,
        vector: delVector,
        contentFingerprint: 'sha256:soft_del_vector',
      });
      await vectorStore.save(delEmbedding);

      // Verify it is retrievable BEFORE soft-deletion
      const beforeResults = await vectorStore.similaritySearch(delVector, {
        tenantId: testTenant,
        generationId: activeGen.id.value,
        limit: 10,
        documentIds: [delDoc.id.value],
      });
      expect(beforeResults.length).toBe(1);

      // Now soft-delete the document
      delDoc.softDelete('usr_admin');
      await docRepo.save(delDoc);

      // Verify that after soft-deletion, vector similarity search returns NOTHING
      const afterResults = await vectorStore.similaritySearch(delVector, {
        tenantId: testTenant,
        generationId: activeGen.id.value,
        limit: 10,
        documentIds: [delDoc.id.value],
      });
      expect(afterResults.length).toBe(0);
    });

    it('17. Scenario 8: Superseded versions follow the approved retrieval policy', async () => {
      if (!isDbAvailable) return;

      const activeGen = (await generationRepo.findActiveByTenantId(testTenant))!;

      // Create multi-version document
      const multiDoc = KnowledgeDocument.create({
        tenantId: testTenant,
        title: 'Document Multi Version',
        uploadedBy: 'usr_admin',
      });
      const v1 = multiDoc.addVersion({
        checksum: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1',
        storageKey: 's3://bucket/mv-v1.pdf',
        fileSize: 1000,
        mimeType: 'application/pdf',
        originalFileName: 'mv-v1.pdf',
        uploadedBy: 'usr_admin',
      });
      await docRepo.save(multiDoc);

      const chunkV1Id = ChunkId.createDeterministic(
        multiDoc.id.value,
        v1.id,
        0,
        'Version 1 Content',
      );
      const chunkV1 = DocumentChunk.create({
        id: chunkV1Id,
        documentId: multiDoc.id.value,
        documentVersionId: v1.id,
        sequence: 0,
        content: 'Version 1 Content',
        tokenCount: 3,
        provenance: ChunkProvenance.create({
          documentId: multiDoc.id.value,
          documentVersionId: v1.id,
          chunkIndex: 0,
          pageNumber: 1,
          checksum: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1',
          configurationVersion: '1.0.0',
        }),
      });
      await chunkRepo.saveChunks(testTenant, multiDoc.id.value, v1.id, [chunkV1]);

      const embV1 = DocumentEmbedding.create({
        chunkId: chunkV1Id,
        documentId: multiDoc.id.value,
        documentVersionId: v1.id,
        indexGenerationId: activeGen.id,
        profile: activeGen.profile,
        vector: createNormalized1024Vector(91.0),
        contentFingerprint: 'sha256:v1',
      });
      await vectorStore.save(embV1);

      // Add Version 2
      const v2 = multiDoc.addVersion({
        checksum: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2',
        storageKey: 's3://bucket/mv-v2.pdf',
        fileSize: 1200,
        mimeType: 'application/pdf',
        originalFileName: 'mv-v2.pdf',
        uploadedBy: 'usr_admin',
      });
      await docRepo.save(multiDoc);

      const chunkV2Id = ChunkId.createDeterministic(
        multiDoc.id.value,
        v2.id,
        0,
        'Version 2 Content',
      );
      const chunkV2 = DocumentChunk.create({
        id: chunkV2Id,
        documentId: multiDoc.id.value,
        documentVersionId: v2.id,
        sequence: 0,
        content: 'Version 2 Content',
        tokenCount: 3,
        provenance: ChunkProvenance.create({
          documentId: multiDoc.id.value,
          documentVersionId: v2.id,
          chunkIndex: 0,
          pageNumber: 1,
          checksum: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2',
          configurationVersion: '1.0.0',
        }),
      });
      await chunkRepo.saveChunks(testTenant, multiDoc.id.value, v2.id, [chunkV2]);

      const embV2 = DocumentEmbedding.create({
        chunkId: chunkV2Id,
        documentId: multiDoc.id.value,
        documentVersionId: v2.id,
        indexGenerationId: activeGen.id,
        profile: activeGen.profile,
        vector: createNormalized1024Vector(92.0),
        contentFingerprint: 'sha256:v2',
      });
      await vectorStore.save(embV2);

      // Verify that findByDocumentVersionId isolates V1 from V2
      const v1Embeddings = await vectorStore.findByDocumentVersionId(v1.id, activeGen.id.value);
      const v2Embeddings = await vectorStore.findByDocumentVersionId(v2.id, activeGen.id.value);

      expect(v1Embeddings.length).toBe(1);
      expect(v1Embeddings[0]!.documentVersionId).toBe(v1.id);
      expect(v2Embeddings.length).toBe(1);
      expect(v2Embeddings[0]!.documentVersionId).toBe(v2.id);
    });

    it('18. Scenario 9: Metadata updates remain consistent after reprocessing', async () => {
      if (!isDbAvailable) return;

      const doc = (await prisma.knowledgeDocument.findFirst({
        where: { tenantId: testTenant, deletedAt: null },
      }))!;
      const chunk = (await prisma.knowledgeChunk.findFirst({
        where: { tenantId: testTenant, documentId: doc.id },
      }))!;
      const gen = (await generationRepo.findActiveByTenantId(testTenant))!;
      const profile = EmbeddingProfile.bgeM3DenseDefault();

      // Reprocess chunk with new vector and fingerprint
      const reprocessed = DocumentEmbedding.create({
        chunkId: ChunkId.create(chunk.id),
        documentId: doc.id,
        documentVersionId: chunk.documentVersionId,
        indexGenerationId: gen.id,
        profile,
        vector: createNormalized1024Vector(95.0),
        contentFingerprint: 'sha256:reprocessed_fp',
      });

      await vectorStore.save(reprocessed);

      const after = await vectorStore.findByChunkId(chunk.id, gen.id.value);
      expect(after).not.toBeNull();
      expect(after!.contentFingerprint).toBe('sha256:reprocessed_fp');
      expect(after!.documentId).toBe(doc.id);
      expect(after!.documentVersionId).toBe(chunk.documentVersionId);
    });

    it('19. Scenario 10: Vector-store failures do not trigger unrestricted retrieval fallback', async () => {
      if (!isDbAvailable) return;

      const gen = (await generationRepo.findActiveByTenantId(testTenant))!;

      // Querying with incompatible vector dimensions throws exception immediately
      await expect(
        vectorStore.similaritySearch(new Array(512).fill(0.1), {
          tenantId: testTenant,
          generationId: gen.id.value,
          limit: 10,
        }),
      ).rejects.toThrow(EmbeddingValidationException);
    });
  });
});
