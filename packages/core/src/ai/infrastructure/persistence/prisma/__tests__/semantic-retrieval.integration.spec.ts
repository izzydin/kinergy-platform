import { PrismaClient } from '@prisma/client';
import { PrismaSemanticRetrievalRepository } from '../repositories/prisma-semantic-retrieval.repository';
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
import { RetrievalQuery } from '../../../../domain/value-objects/retrieval-query.vo';
import { RetrievalCriteria } from '../../../../domain/value-objects/retrieval-criteria.vo';
import { SimilarityScore } from '../../../../domain/value-objects/similarity-score.vo';
import { VisibilityScope } from '../../../../domain/enums/visibility-scope.enum';
import { EmbeddingDimensionMismatchException } from '../../../../domain/exceptions/ai-provider.exceptions';
import { EmbeddingValidationException } from '../../../../domain/exceptions/vector-indexing.exceptions';

describe('AI-06.3 — Semantic Retrieval Persistence Adapter Integration (Prisma + pgvector)', () => {
  let prisma: PrismaClient;
  let retrievalRepo: PrismaSemanticRetrievalRepository;
  let vectorStore: PrismaVectorStoreRepository;
  let generationRepo: PrismaIndexGenerationRepository;
  let docRepo: PrismaKnowledgeDocumentRepository;
  let chunkRepo: PrismaKnowledgeChunkRepository;
  let isDbAvailable = false;

  const tenantA = `tenant_retrieval_a_${Date.now()}`;
  const tenantB = `tenant_retrieval_b_${Date.now()}`;
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

      retrievalRepo = new PrismaSemanticRetrievalRepository(prisma);
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
      // Clean up both test tenants
      for (const tenant of [tenantA, tenantB]) {
        await prisma.knowledgeDocument
          .deleteMany({
            where: { tenantId: tenant },
          })
          .catch(() => {});
        await prisma.indexGeneration
          .deleteMany({
            where: { tenantId: tenant },
          })
          .catch(() => {});
      }
      await prisma.$disconnect();
    }
  });

  it('1. should verify pgvector extension and cosine index on document_embeddings', async () => {
    if (!isDbAvailable) return;

    const extRows = await prisma.$queryRawUnsafe<Array<{ extname: string; extversion: string }>>(
      `SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';`,
    );
    expect(extRows.length).toBe(1);
    expect(extRows[0]?.extname).toBe('vector');

    const indexRows = await prisma.$queryRawUnsafe<Array<{ indexname: string; indexdef: string }>>(
      `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'document_embeddings' AND indexname = 'idx_document_embeddings_hnsw';`,
    );
    expect(indexRows.length).toBe(1);
    expect(indexRows[0]?.indexdef).toContain('vector_cosine_ops');
  });

  it('2. should enforce multi-tenant isolation: Tenant A queries never return Tenant B chunks', async () => {
    if (!isDbAvailable) return;

    const profile = EmbeddingProfile.bgeM3DenseDefault();
    const commonVector = createNormalized1024Vector(42.0);

    // Seed Tenant A
    const docA = KnowledgeDocument.create({
      tenantId: tenantA,
      title: 'Manual de Tenant A',
      uploadedBy: 'usr_admin_a',
      visibilityScope: VisibilityScope.ALL_STAFF,
    });
    const verA = docA.addVersion({
      checksum,
      storageKey: 's3://bucket/manual_a.pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
      originalFileName: 'manual_a.pdf',
      uploadedBy: 'usr_admin_a',
    });
    await docRepo.save(docA);

    const chunkIdA = ChunkId.createDeterministic(docA.id.value, verA.id, 0, 'Contenido Tenant A');
    const chunkA = DocumentChunk.create({
      id: chunkIdA,
      documentId: docA.id.value,
      documentVersionId: verA.id,
      sequence: 0,
      content: 'Contenido exclusivo de Tenant A para protocolo de rehabilitación.',
      tokenCount: 10,
      provenance: ChunkProvenance.create({
        documentId: docA.id.value,
        documentVersionId: verA.id,
        chunkIndex: 0,
        pageNumber: 1,
        checksum,
        configurationVersion: '1.0.0',
      }),
    });
    await chunkRepo.saveChunks(tenantA, docA.id.value, verA.id, [chunkA]);

    const genA = IndexGeneration.create({
      tenantId: tenantA,
      generationNumber: 1,
      profile,
      targetChunkCount: 1,
    });
    genA.startBuilding();
    genA.recordProgress(1);
    genA.startValidation();
    genA.activate();
    await generationRepo.save(genA);

    const embA = DocumentEmbedding.create({
      chunkId: chunkIdA,
      documentId: docA.id.value,
      documentVersionId: verA.id,
      indexGenerationId: genA.id,
      profile,
      vector: commonVector,
      contentFingerprint: 'sha256:fp_a_001',
    });
    await vectorStore.save(embA);

    // Seed Tenant B with IDENTICAL vector
    const docB = KnowledgeDocument.create({
      tenantId: tenantB,
      title: 'Manual confidencial Tenant B',
      uploadedBy: 'usr_admin_b',
      visibilityScope: VisibilityScope.ALL_STAFF,
    });
    const verB = docB.addVersion({
      checksum,
      storageKey: 's3://bucket/manual_b.pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
      originalFileName: 'manual_b.pdf',
      uploadedBy: 'usr_admin_b',
    });
    await docRepo.save(docB);

    const chunkIdB = ChunkId.createDeterministic(docB.id.value, verB.id, 0, 'Contenido Tenant B');
    const chunkB = DocumentChunk.create({
      id: chunkIdB,
      documentId: docB.id.value,
      documentVersionId: verB.id,
      sequence: 0,
      content: 'Contenido ultra secreto de Tenant B.',
      tokenCount: 8,
      provenance: ChunkProvenance.create({
        documentId: docB.id.value,
        documentVersionId: verB.id,
        chunkIndex: 0,
        pageNumber: 1,
        checksum,
        configurationVersion: '1.0.0',
      }),
    });
    await chunkRepo.saveChunks(tenantB, docB.id.value, verB.id, [chunkB]);

    const genB = IndexGeneration.create({
      tenantId: tenantB,
      generationNumber: 1,
      profile,
      targetChunkCount: 1,
    });
    genB.startBuilding();
    genB.recordProgress(1);
    genB.startValidation();
    genB.activate();
    await generationRepo.save(genB);

    const embB = DocumentEmbedding.create({
      chunkId: chunkIdB,
      documentId: docB.id.value,
      documentVersionId: verB.id,
      indexGenerationId: genB.id,
      profile,
      vector: commonVector,
      contentFingerprint: 'sha256:fp_b_001',
    });
    await vectorStore.save(embB);

    // Query as Tenant A using the exact commonVector
    const queryA = RetrievalQuery.create({
      query: 'protocolo de rehabilitación',
      criteria: RetrievalCriteria.create({
        tenantId: tenantA,
      }),
      topK: 10,
    });

    const resultsA = await retrievalRepo.search(commonVector, queryA);
    expect(resultsA.length).toBe(1);
    expect(resultsA[0]?.chunkId.value).toBe(chunkIdA.value);
    expect(resultsA[0]?.content).toContain('Tenant A');
    expect(resultsA[0]?.documentId).toBe(docA.id.value);

    // Verify Tenant B chunks are never returned
    expect(resultsA.some((r) => r.documentId === docB.id.value)).toBe(false);
    expect(resultsA.some((r) => r.content.includes('Tenant B'))).toBe(false);

    // Verify countMatches isolation
    const countA = await retrievalRepo.countMatches(commonVector, queryA);
    expect(countA).toBe(1);
  });

  it('3. should order by cosine distance ASC, convert similarity correctly, and enforce topK limit', async () => {
    if (!isDbAvailable) return;

    const profile = EmbeddingProfile.bgeM3DenseDefault();
    const queryVector = createNormalized1024Vector(10.0);

    // Seed 3 chunks with varying distances to queryVector
    const doc = KnowledgeDocument.create({
      tenantId: tenantA,
      title: 'Ranking Test Document',
      uploadedBy: 'usr_admin_a',
      visibilityScope: VisibilityScope.ALL_STAFF,
    });
    const ver = doc.addVersion({
      checksum,
      storageKey: 's3://bucket/ranking.pdf',
      fileSize: 2048,
      mimeType: 'application/pdf',
      originalFileName: 'ranking.pdf',
      uploadedBy: 'usr_admin_a',
    });
    await docRepo.save(doc);

    // Vector 1: close (seed 10.0 - identical -> distance ~ 0, similarity ~ 1.0)
    // Vector 2: medium (seed 20.0)
    // Vector 3: far (seed 50.0)
    const vec1 = queryVector;
    const vec2 = createNormalized1024Vector(20.0);
    const vec3 = createNormalized1024Vector(50.0);

    const chunk1 = DocumentChunk.create({
      id: ChunkId.createDeterministic(doc.id.value, ver.id, 1, 'Chunk 1'),
      documentId: doc.id.value,
      documentVersionId: ver.id,
      sequence: 1,
      content: 'Primer chunk muy relevante',
      tokenCount: 5,
      provenance: ChunkProvenance.create({
        documentId: doc.id.value,
        documentVersionId: ver.id,
        chunkIndex: 1,
        pageNumber: 1,
        checksum,
        configurationVersion: '1.0.0',
      }),
    });
    const chunk2 = DocumentChunk.create({
      id: ChunkId.createDeterministic(doc.id.value, ver.id, 2, 'Chunk 2'),
      documentId: doc.id.value,
      documentVersionId: ver.id,
      sequence: 2,
      content: 'Segundo chunk medianamente relevante',
      tokenCount: 5,
      provenance: ChunkProvenance.create({
        documentId: doc.id.value,
        documentVersionId: ver.id,
        chunkIndex: 2,
        pageNumber: 2,
        checksum,
        configurationVersion: '1.0.0',
      }),
    });
    const chunk3 = DocumentChunk.create({
      id: ChunkId.createDeterministic(doc.id.value, ver.id, 3, 'Chunk 3'),
      documentId: doc.id.value,
      documentVersionId: ver.id,
      sequence: 3,
      content: 'Tercer chunk poco relevante',
      tokenCount: 5,
      provenance: ChunkProvenance.create({
        documentId: doc.id.value,
        documentVersionId: ver.id,
        chunkIndex: 3,
        pageNumber: 3,
        checksum,
        configurationVersion: '1.0.0',
      }),
    });

    await chunkRepo.saveChunks(tenantA, doc.id.value, ver.id, [chunk1, chunk2, chunk3]);

    // Retrieve active generation for tenantA
    const activeGen = await generationRepo.findActiveByTenantId(tenantA);
    expect(activeGen).not.toBeNull();

    await vectorStore.save(
      DocumentEmbedding.create({
        chunkId: chunk1.id,
        documentId: doc.id.value,
        documentVersionId: ver.id,
        indexGenerationId: activeGen!.id,
        profile,
        vector: vec1,
        contentFingerprint: 'sha256:fp_rank_001',
      }),
    );
    await vectorStore.save(
      DocumentEmbedding.create({
        chunkId: chunk2.id,
        documentId: doc.id.value,
        documentVersionId: ver.id,
        indexGenerationId: activeGen!.id,
        profile,
        vector: vec2,
        contentFingerprint: 'sha256:fp_rank_002',
      }),
    );
    await vectorStore.save(
      DocumentEmbedding.create({
        chunkId: chunk3.id,
        documentId: doc.id.value,
        documentVersionId: ver.id,
        indexGenerationId: activeGen!.id,
        profile,
        vector: vec3,
        contentFingerprint: 'sha256:fp_rank_003',
      }),
    );

    // Search with topK = 2
    const query = RetrievalQuery.create({
      query: 'ranking test',
      criteria: RetrievalCriteria.create({
        tenantId: tenantA,
        documentIds: [doc.id.value],
      }),
      topK: 2,
    });

    const results = await retrievalRepo.search(queryVector, query);
    expect(results.length).toBe(2);

    // Verify ordering: closest first (distance ascending, similarity descending)
    expect(results[0]?.chunkId.value).toBe(chunk1.id.value);
    expect(results[0]?.similarity.value).toBeCloseTo(1.0, 3);
    expect(results[0]?.distance).toBeCloseTo(0.0, 3);

    // Verify mathematical relation: similarity = 1 - distance
    expect(results[1]?.similarity.value).toBeCloseTo(1 - (results[1]?.distance ?? 0), 4);
    expect(results[0]!.similarity.value).toBeGreaterThanOrEqual(results[1]!.similarity.value);
  });

  it('4. should filter by minSimilarity threshold directly in SQL query', async () => {
    if (!isDbAvailable) return;

    const queryVector = createNormalized1024Vector(10.0);

    // High threshold: only identical or near-identical vectors pass
    const strictQuery = RetrievalQuery.create({
      query: 'strict threshold',
      criteria: RetrievalCriteria.create({
        tenantId: tenantA,
      }),
      minSimilarity: SimilarityScore.create(0.95),
      topK: 10,
    });

    const results = await retrievalRepo.search(queryVector, strictQuery);
    // Only vec1 (which is identical to queryVector) should pass 0.95
    for (const r of results) {
      expect(r.similarity.value).toBeGreaterThanOrEqual(0.95);
    }
  });

  it('5. should enforce document visibility scope authorization', async () => {
    if (!isDbAvailable) return;

    const profile = EmbeddingProfile.bgeM3DenseDefault();
    const activeGen = await generationRepo.findActiveByTenantId(tenantA);
    const testVec = createNormalized1024Vector(77.0);

    // Create document with restricted scope CLINICAL_STAFF
    const clinicalDoc = KnowledgeDocument.create({
      tenantId: tenantA,
      title: 'Manual para Personal Clínico',
      uploadedBy: 'usr_clinical',
      visibilityScope: VisibilityScope.CLINICAL_STAFF,
    });
    const clinicalVer = clinicalDoc.addVersion({
      checksum,
      storageKey: 's3://bucket/clinical.pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
      originalFileName: 'clinical.pdf',
      uploadedBy: 'usr_clinical',
    });
    await docRepo.save(clinicalDoc);

    const chunkClinical = DocumentChunk.create({
      id: ChunkId.createDeterministic(
        clinicalDoc.id.value,
        clinicalVer.id,
        0,
        'Solo Personal Clinico',
      ),
      documentId: clinicalDoc.id.value,
      documentVersionId: clinicalVer.id,
      sequence: 0,
      content: 'Contenido exclusivo para personal clínico colegiado.',
      tokenCount: 6,
      provenance: ChunkProvenance.create({
        documentId: clinicalDoc.id.value,
        documentVersionId: clinicalVer.id,
        chunkIndex: 0,
        pageNumber: 1,
        checksum,
        configurationVersion: '1.0.0',
      }),
    });
    await chunkRepo.saveChunks(tenantA, clinicalDoc.id.value, clinicalVer.id, [chunkClinical]);

    await vectorStore.save(
      DocumentEmbedding.create({
        chunkId: chunkClinical.id,
        documentId: clinicalDoc.id.value,
        documentVersionId: clinicalVer.id,
        indexGenerationId: activeGen!.id,
        profile,
        vector: testVec,
        contentFingerprint: 'sha256:fp_clinical_001',
      }),
    );

    // Query 1: User with only ALL_STAFF scope
    const staffQuery = RetrievalQuery.create({
      query: 'personal clinico',
      criteria: RetrievalCriteria.create({
        tenantId: tenantA,
        documentIds: [clinicalDoc.id.value],
        allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
      }),
      topK: 5,
    });
    const staffResults = await retrievalRepo.search(testVec, staffQuery);
    expect(staffResults.length).toBe(0);

    // Query 2: User with CLINICAL_STAFF scope
    const clinicalQuery = RetrievalQuery.create({
      query: 'personal clinico',
      criteria: RetrievalCriteria.create({
        tenantId: tenantA,
        documentIds: [clinicalDoc.id.value],
        allowedVisibilityScopes: [VisibilityScope.CLINICAL_STAFF],
      }),
      topK: 5,
    });
    const clinicalResults = await retrievalRepo.search(testVec, clinicalQuery);
    expect(clinicalResults.length).toBe(1);
    expect(clinicalResults[0]?.chunkId.value).toBe(chunkClinical.id.value);
  });

  it('6. should exclude soft-deleted documents from search results and match counts', async () => {
    if (!isDbAvailable) return;

    const profile = EmbeddingProfile.bgeM3DenseDefault();
    const activeGen = await generationRepo.findActiveByTenantId(tenantA);
    const testVec = createNormalized1024Vector(88.0);

    const docToDelete = KnowledgeDocument.create({
      tenantId: tenantA,
      title: 'Documento Obsoleto a Eliminar',
      uploadedBy: 'usr_admin_a',
      visibilityScope: VisibilityScope.ALL_STAFF,
    });
    const ver = docToDelete.addVersion({
      checksum,
      storageKey: 's3://bucket/to_delete.pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
      originalFileName: 'to_delete.pdf',
      uploadedBy: 'usr_admin_a',
    });
    await docRepo.save(docToDelete);

    const chunk = DocumentChunk.create({
      id: ChunkId.createDeterministic(docToDelete.id.value, ver.id, 0, 'Chunk Obsoleto'),
      documentId: docToDelete.id.value,
      documentVersionId: ver.id,
      sequence: 0,
      content: 'Contenido que sera marcado como soft-deleted.',
      tokenCount: 7,
      provenance: ChunkProvenance.create({
        documentId: docToDelete.id.value,
        documentVersionId: ver.id,
        chunkIndex: 0,
        pageNumber: 1,
        checksum,
        configurationVersion: '1.0.0',
      }),
    });
    await chunkRepo.saveChunks(tenantA, docToDelete.id.value, ver.id, [chunk]);

    await vectorStore.save(
      DocumentEmbedding.create({
        chunkId: chunk.id,
        documentId: docToDelete.id.value,
        documentVersionId: ver.id,
        indexGenerationId: activeGen!.id,
        profile,
        vector: testVec,
        contentFingerprint: 'sha256:fp_del_001',
      }),
    );

    const query = RetrievalQuery.create({
      query: 'soft-deleted',
      criteria: RetrievalCriteria.create({
        tenantId: tenantA,
        documentIds: [docToDelete.id.value],
      }),
      topK: 5,
    });

    // Before soft-deletion: should find 1
    const beforeResults = await retrievalRepo.search(testVec, query);
    expect(beforeResults.length).toBe(1);

    // Perform soft deletion: set deleted_at
    await prisma.knowledgeDocument.update({
      where: { id: docToDelete.id.value },
      data: { deletedAt: new Date() },
    });

    // After soft-deletion: must be completely excluded
    const afterResults = await retrievalRepo.search(testVec, query);
    expect(afterResults.length).toBe(0);

    const afterCount = await retrievalRepo.countMatches(testVec, query);
    expect(afterCount).toBe(0);
  });

  it('7. should filter by metadata JSON containment (@>)', async () => {
    if (!isDbAvailable) return;

    const profile = EmbeddingProfile.bgeM3DenseDefault();
    const activeGen = await generationRepo.findActiveByTenantId(tenantA);
    const testVec = createNormalized1024Vector(99.0);

    const doc = KnowledgeDocument.create({
      tenantId: tenantA,
      title: 'Documento con Metadata JSON',
      uploadedBy: 'usr_admin_a',
      visibilityScope: VisibilityScope.ALL_STAFF,
    });
    const ver = doc.addVersion({
      checksum,
      storageKey: 's3://bucket/meta.pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
      originalFileName: 'meta.pdf',
      uploadedBy: 'usr_admin_a',
    });
    await docRepo.save(doc);

    const chunkRehab = DocumentChunk.create({
      id: ChunkId.createDeterministic(doc.id.value, ver.id, 0, 'Kinesio Rehab'),
      documentId: doc.id.value,
      documentVersionId: ver.id,
      sequence: 0,
      content: 'Tratamiento de ligamento cruzado anterior.',
      tokenCount: 6,
      provenance: ChunkProvenance.create({
        documentId: doc.id.value,
        documentVersionId: ver.id,
        chunkIndex: 0,
        pageNumber: 1,
        checksum,
        configurationVersion: '1.0.0',
      }),
      metadata: { department: 'kinesiology', subspecialty: 'knee_rehab' },
    });

    const chunkNutrition = DocumentChunk.create({
      id: ChunkId.createDeterministic(doc.id.value, ver.id, 1, 'Nutricion'),
      documentId: doc.id.value,
      documentVersionId: ver.id,
      sequence: 1,
      content: 'Plan nutricional de recuperación.',
      tokenCount: 5,
      provenance: ChunkProvenance.create({
        documentId: doc.id.value,
        documentVersionId: ver.id,
        chunkIndex: 1,
        pageNumber: 2,
        checksum,
        configurationVersion: '1.0.0',
      }),
      metadata: { department: 'nutrition', subspecialty: 'macros' },
    });

    await chunkRepo.saveChunks(tenantA, doc.id.value, ver.id, [chunkRehab, chunkNutrition]);

    await vectorStore.save(
      DocumentEmbedding.create({
        chunkId: chunkRehab.id,
        documentId: doc.id.value,
        documentVersionId: ver.id,
        indexGenerationId: activeGen!.id,
        profile,
        vector: testVec,
        contentFingerprint: 'sha256:fp_meta_rehab',
      }),
    );
    await vectorStore.save(
      DocumentEmbedding.create({
        chunkId: chunkNutrition.id,
        documentId: doc.id.value,
        documentVersionId: ver.id,
        indexGenerationId: activeGen!.id,
        profile,
        vector: testVec,
        contentFingerprint: 'sha256:fp_meta_nutr',
      }),
    );

    // Query with JSON metadata filter: department = 'kinesiology'
    const metaQuery = RetrievalQuery.create({
      query: 'ligamento',
      criteria: RetrievalCriteria.create({
        tenantId: tenantA,
        documentIds: [doc.id.value],
        metadataFilter: { department: 'kinesiology' },
      }),
      topK: 5,
    });

    const results = await retrievalRepo.search(testVec, metaQuery);
    expect(results.length).toBe(1);
    expect(results[0]?.chunkId.value).toBe(chunkRehab.id.value);
    expect(results[0]?.metadata).toEqual(
      expect.objectContaining({ department: 'kinesiology', subspecialty: 'knee_rehab' }),
    );
  });

  it('8. should filter by MIME types and document IDs', async () => {
    if (!isDbAvailable) return;

    const testVec = createNormalized1024Vector(10.0);

    // Filter by PDF mimeType
    const pdfQuery = RetrievalQuery.create({
      query: 'pdf only',
      criteria: RetrievalCriteria.create({
        tenantId: tenantA,
        mimeTypes: ['application/pdf'],
      }),
      topK: 5,
    });
    const pdfResults = await retrievalRepo.search(testVec, pdfQuery);
    for (const r of pdfResults) {
      expect(r.provenance.mimeType).toBe('application/pdf');
    }

    // Filter by non-matching mimeType
    const docxQuery = RetrievalQuery.create({
      query: 'docx only',
      criteria: RetrievalCriteria.create({
        tenantId: tenantA,
        mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      }),
      topK: 5,
    });
    const docxResults = await retrievalRepo.search(testVec, docxQuery);
    expect(docxResults.length).toBe(0);
  });

  it('9. should validate and reject invalid query vectors (empty, dimension mismatch, NaN/Infinity)', async () => {
    if (!isDbAvailable) return;
    const validCriteria = RetrievalCriteria.create({ tenantId: tenantA });
    const query = RetrievalQuery.create({ query: 'validation test', criteria: validCriteria });

    // Empty vector
    await expect(retrievalRepo.search([], query)).rejects.toThrow(EmbeddingValidationException);

    // Dimension mismatch (512 instead of 1024)
    const dim512 = new Array(512).fill(0.1);
    await expect(retrievalRepo.search(dim512, query)).rejects.toThrow(
      EmbeddingDimensionMismatchException,
    );

    // Vector with NaN
    const nanVector = new Array(1024).fill(0);
    nanVector[5] = NaN;
    await expect(retrievalRepo.search(nanVector, query)).rejects.toThrow(
      EmbeddingValidationException,
    );

    // Vector with Infinity
    const infVector = new Array(1024).fill(0);
    infVector[10] = Infinity;
    await expect(retrievalRepo.search(infVector, query)).rejects.toThrow(
      EmbeddingValidationException,
    );
  });

  it('10. should resist SQL injection attempts in query criteria', async () => {
    if (!isDbAvailable) return;

    const testVec = createNormalized1024Vector(1.0);

    // Malicious tenant ID with SQL injection payload
    const maliciousTenant = `${tenantA}' OR '1'='1`;
    const injectionQuery = RetrievalQuery.create({
      query: 'malicious injection',
      criteria: RetrievalCriteria.create({
        tenantId: maliciousTenant,
      }),
      topK: 5,
    });

    // Should safely execute parameterized query and return 0 matches (no matching tenant)
    const results = await retrievalRepo.search(testVec, injectionQuery);
    expect(results.length).toBe(0);

    const count = await retrievalRepo.countMatches(testVec, injectionQuery);
    expect(count).toBe(0);
  });
});
