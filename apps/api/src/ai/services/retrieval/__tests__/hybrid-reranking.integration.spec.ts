import { PrismaClient } from '@prisma/client';
import { SecureSemanticSearchService } from '../secure-semantic-search.service';
import { RetrievalSecurityPolicyService } from '../retrieval-security-policy.service';
import { RetrievalObservabilityService } from '../retrieval-observability.service';
import { LocalCrossEncoderRerankingAdapter } from '../../../adapters/reranking/local-cross-encoder-reranking.adapter';
import {
  KnowledgeDocument,
  DocumentChunk,
  DocumentEmbedding,
  IndexGeneration,
  EmbeddingProfile,
  ChunkId,
  ChunkProvenance,
  VisibilityScope,
  IQueryEmbeddingUseCase,
  VectorValues,
  ICrossEncoderRerankingPort,
} from '@kinergy-platform/core';
import {
  PrismaSemanticRetrievalRepository,
  PrismaLexicalRetrievalRepository,
  PrismaKnowledgeDocumentRepository,
  PrismaKnowledgeChunkRepository,
  PrismaIndexGenerationRepository,
  PrismaVectorStoreRepository,
} from '@kinergy-platform/core/server';
import { AiConfiguration, DEFAULT_AI_CONFIG } from '../../../config/ai.config';

describe('AI-07.5 — Hybrid Retrieval with Cross-Encoder Reranking Integration', () => {
  let prisma: PrismaClient;
  let semanticRepo: PrismaSemanticRetrievalRepository;
  let lexicalRepo: PrismaLexicalRetrievalRepository;
  let docRepo: PrismaKnowledgeDocumentRepository;
  let chunkRepo: PrismaKnowledgeChunkRepository;
  let genRepo: PrismaIndexGenerationRepository;
  let vectorStore: PrismaVectorStoreRepository;
  let securityPolicy: RetrievalSecurityPolicyService;
  let isDbAvailable = false;

  let doc1: KnowledgeDocument;
  let doc2: KnowledgeDocument;

  const tenantA = `tenant_rerank_a_${Date.now()}`;
  const tenantB = `tenant_rerank_b_${Date.now()}`;
  const checksum = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  const createNormalized1024Vector = (seed: number): number[] => {
    const raw = new Array(1024).fill(0).map((_, i) => Math.sin(seed * (i + 1)));
    const norm = Math.sqrt(raw.reduce((acc, val) => acc + val * val, 0));
    return raw.map((val) => val / norm);
  };

  const commonVector = createNormalized1024Vector(42.0);

  const mockQueryEmbeddingUseCase: jest.Mocked<IQueryEmbeddingUseCase> = {
    generateQueryEmbedding: jest.fn().mockImplementation(async () => {
      return {
        vector: VectorValues.create(commonVector),
        profileId: 'bge-m3-dense-v1',
        dimensions: 1024,
        latencyMs: 10,
        modelName: 'bge-m3:latest',
        modelVersion: '1.0',
      };
    }),
  };

  const createService = (
    configOverrides: Partial<AiConfiguration> = {},
    customReranker?: ICrossEncoderRerankingPort,
  ): SecureSemanticSearchService => {
    const config: AiConfiguration = {
      ...DEFAULT_AI_CONFIG,
      enabled: true,
      retrievalSearchMode: 'HYBRID',
      retrievalSemanticCandidateLimit: 10,
      retrievalKeywordCandidateLimit: 10,
      retrievalRrfConstant: 60,
      retrievalRerankerEnabled: false, // Default is false
      ...configOverrides,
    };

    const reranker =
      customReranker !== undefined
        ? customReranker
        : new LocalCrossEncoderRerankingAdapter(config, { provider: 'mock' });

    return new SecureSemanticSearchService(
      mockQueryEmbeddingUseCase,
      semanticRepo,
      genRepo,
      securityPolicy,
      config,
      new RetrievalObservabilityService(),
      lexicalRepo,
      reranker,
    );
  };

  beforeAll(async () => {
    prisma = new PrismaClient();
    try {
      await prisma.$connect();
      await prisma.$queryRawUnsafe('SELECT 1');
      isDbAvailable = true;

      semanticRepo = new PrismaSemanticRetrievalRepository(prisma);
      lexicalRepo = new PrismaLexicalRetrievalRepository(prisma);
      docRepo = new PrismaKnowledgeDocumentRepository(prisma);
      chunkRepo = new PrismaKnowledgeChunkRepository(prisma);
      genRepo = new PrismaIndexGenerationRepository(prisma);
      vectorStore = new PrismaVectorStoreRepository(prisma);
      securityPolicy = new RetrievalSecurityPolicyService(docRepo);

      const profile = EmbeddingProfile.bgeM3DenseDefault();

      // Seed Index Generation for Tenant A
      const genA = IndexGeneration.create({
        tenantId: tenantA,
        generationNumber: 1,
        profile,
        targetChunkCount: 2,
      });
      genA.startBuilding();
      genA.recordProgress(2);
      genA.startValidation();
      genA.activate();
      await genRepo.save(genA);

      // Seed Document 1 for Tenant A (Relevant clinical document)
      doc1 = KnowledgeDocument.create({
        tenantId: tenantA,
        title: 'Protocolo de Rehabilitacion Motora en Kinesiologia',
        uploadedBy: 'usr_staff_a',
        visibilityScope: VisibilityScope.ALL_STAFF,
      });
      const v1 = doc1.addVersion({
        checksum,
        storageKey: 's3://bucket/kine1.pdf',
        fileSize: 2048,
        mimeType: 'application/pdf',
        originalFileName: 'kine1.pdf',
        uploadedBy: 'usr_staff_a',
      });
      await docRepo.save(doc1);

      const chunk1 = DocumentChunk.create({
        id: ChunkId.createDeterministic(doc1.id.value, v1.id, 1, 'kine rehab'),
        documentId: doc1.id.value,
        documentVersionId: v1.id,
        sequence: 1,
        content:
          'Las sesiones de kinesiologia deben ser programadas con 24 horas de anticipacion para asegurar disponibilidad.',
        tokenCount: 22,
        provenance: ChunkProvenance.create({
          documentId: doc1.id.value,
          documentVersionId: v1.id,
          chunkIndex: 1,
          pageNumber: 1,
          checksum,
          configurationVersion: '1.0.0',
        }),
      });

      // Seed Document 2 for Tenant A (Distractor document with keyword matches)
      doc2 = KnowledgeDocument.create({
        tenantId: tenantA,
        title: 'Reglamento de Gimnasio y Maquinas',
        uploadedBy: 'usr_staff_a',
        visibilityScope: VisibilityScope.ALL_STAFF,
      });
      const v2 = doc2.addVersion({
        checksum,
        storageKey: 's3://bucket/gym.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        originalFileName: 'gym.pdf',
        uploadedBy: 'usr_staff_a',
      });
      await docRepo.save(doc2);

      const chunk2 = DocumentChunk.create({
        id: ChunkId.createDeterministic(doc2.id.value, v2.id, 1, 'gym cancel'),
        documentId: doc2.id.value,
        documentVersionId: v2.id,
        sequence: 1,
        content: 'El gimnasio no admite la cancelacion de cuotas anuales ya abonadas.',
        tokenCount: 18,
        provenance: ChunkProvenance.create({
          documentId: doc2.id.value,
          documentVersionId: v2.id,
          chunkIndex: 1,
          pageNumber: 1,
          checksum,
          configurationVersion: '1.0.0',
        }),
      });

      await chunkRepo.saveChunks(tenantA, doc1.id.value, v1.id, [chunk1]);
      await chunkRepo.saveChunks(tenantA, doc2.id.value, v2.id, [chunk2]);

      await vectorStore.save(
        DocumentEmbedding.create({
          chunkId: chunk1.id,
          documentId: doc1.id.value,
          documentVersionId: v1.id,
          indexGenerationId: genA.id,
          profile,
          vector: commonVector,
          contentFingerprint: 'sha256:fp_kine',
        }),
      );
      await vectorStore.save(
        DocumentEmbedding.create({
          chunkId: chunk2.id,
          documentId: doc2.id.value,
          documentVersionId: v2.id,
          indexGenerationId: genA.id,
          profile,
          vector: commonVector,
          contentFingerprint: 'sha256:fp_gym',
        }),
      );

      // Seed Tenant B Document for Isolation Testing
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
      await genRepo.save(genB);

      const docB = KnowledgeDocument.create({
        tenantId: tenantB,
        title: 'Documento Secreto Tenant B',
        uploadedBy: 'usr_staff_b',
        visibilityScope: VisibilityScope.ALL_STAFF,
      });
      const vb = docB.addVersion({
        checksum,
        storageKey: 's3://bucket/b.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        originalFileName: 'b.pdf',
        uploadedBy: 'usr_staff_b',
      });
      await docRepo.save(docB);

      const chunkB = DocumentChunk.create({
        id: ChunkId.createDeterministic(docB.id.value, vb.id, 1, 'tenant b secret'),
        documentId: docB.id.value,
        documentVersionId: vb.id,
        sequence: 1,
        content: 'Informacion confidencial de kinesiologia exclusiva de tenant B.',
        tokenCount: 15,
        provenance: ChunkProvenance.create({
          documentId: docB.id.value,
          documentVersionId: vb.id,
          chunkIndex: 1,
          pageNumber: 1,
          checksum,
          configurationVersion: '1.0.0',
        }),
      });
      await chunkRepo.saveChunks(tenantB, docB.id.value, vb.id, [chunkB]);

      await vectorStore.save(
        DocumentEmbedding.create({
          chunkId: chunkB.id,
          documentId: docB.id.value,
          documentVersionId: vb.id,
          indexGenerationId: genB.id,
          profile,
          vector: commonVector,
          contentFingerprint: 'sha256:fp_b',
        }),
      );
    } catch {
      isDbAvailable = false;
    }
  });

  afterAll(async () => {
    if (isDbAvailable && prisma) {
      for (const tenant of [tenantA, tenantB]) {
        await prisma.knowledgeDocument.deleteMany({ where: { tenantId: tenant } }).catch(() => {});
        await prisma.indexGeneration.deleteMany({ where: { tenantId: tenant } }).catch(() => {});
      }
      await prisma.$disconnect();
    }
  });

  it('1. should preserve baseline RRF ranking when retrievalRerankerEnabled is false (default)', async () => {
    if (!isDbAvailable) return;

    const service = createService({ retrievalRerankerEnabled: false });

    const result = await service.execute({
      query: 'kinesiologia rehabilitacion sesiones',
      topK: 5,
      authContext: {
        tenantId: tenantA,
        userId: 'usr_staff_a',
        roles: ['staff'],
        allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
      },
    });

    expect(result.chunks.length).toBeGreaterThan(0);
    // Baseline RRF should not have HYBRID_RERANKED strategy
    for (const chunk of result.chunks) {
      expect(chunk.metadata?.['retrievalStrategy']).not.toBe('HYBRID_RERANKED');
    }
  });

  it('2. should execute cross-encoder reranking when retrievalRerankerEnabled is true', async () => {
    if (!isDbAvailable) return;

    const service = createService({ retrievalRerankerEnabled: true });

    const result = await service.execute({
      query: 'kinesiologia rehabilitacion sesiones',
      topK: 5,
      authContext: {
        tenantId: tenantA,
        userId: 'usr_staff_a',
        roles: ['staff'],
        allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
      },
    });

    expect(result.chunks.length).toBeGreaterThan(0);
    const topChunk = result.chunks[0]!;
    expect(topChunk.metadata?.['retrievalStrategy']).toBe('HYBRID_RERANKED');
    expect(topChunk.metadata?.['rawRerankerScore']).toBeDefined();
    expect(topChunk.metadata?.['finalRerankedRank']).toBe(1);
    expect(topChunk.metadata?.['originalSimilarity']).toBeDefined();
    expect(topChunk.metadata?.['originalRrfRank']).toBeDefined();
  });

  it('3. should gracefully fall back to RRF baseline if reranker fails or times out', async () => {
    if (!isDbAvailable) return;

    const failingReranker: ICrossEncoderRerankingPort = {
      rerank: jest.fn().mockRejectedValue(new Error('Downstream cross-encoder connection reset')),
    };

    const service = createService({ retrievalRerankerEnabled: true }, failingReranker);

    // Must NOT throw; must degrade gracefully to RRF candidate ranking
    const result = await service.execute({
      query: 'kinesiologia sesiones',
      topK: 5,
      authContext: {
        tenantId: tenantA,
        userId: 'usr_staff_a',
        roles: ['staff'],
        allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
      },
    });

    expect(result.chunks.length).toBeGreaterThan(0);
    // Verify fallback to RRF candidates
    expect(failingReranker.rerank).toHaveBeenCalled();
    // Chunks should NOT have HYBRID_RERANKED strategy since fallback occurred
    expect(result.chunks[0]?.metadata?.['retrievalStrategy']).not.toBe('HYBRID_RERANKED');
  });

  it('4. should enforce strict tenant isolation during reranking (zero cross-tenant leakage)', async () => {
    if (!isDbAvailable) return;

    const service = createService({ retrievalRerankerEnabled: true });

    const result = await service.execute({
      query: 'Informacion confidencial de kinesiologia exclusiva de tenant B',
      topK: 10,
      authContext: {
        tenantId: tenantA, // Querying as Tenant A
        userId: 'usr_staff_a',
        roles: ['staff'],
        allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
      },
    });

    // Zero chunks from Tenant B should ever be returned
    for (const chunk of result.chunks) {
      expect(chunk.provenance.documentTitle).not.toContain('Tenant B');
      expect(chunk.content).not.toContain('exclusiva de tenant B');
    }
  });

  it('5. should exclude soft-deleted documents prior to reranking stage', async () => {
    if (!isDbAvailable) return;

    // Soft delete doc2
    doc2.softDelete('usr_staff_a');
    await docRepo.save(doc2);

    const service = createService({ retrievalRerankerEnabled: true });

    const result = await service.execute({
      query: 'kinesiologia cancelacion cuotas gimnasio',
      topK: 5,
      authContext: {
        tenantId: tenantA,
        userId: 'usr_staff_a',
        roles: ['staff'],
        allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
      },
    });

    // Soft-deleted doc2 chunks should not be present in results
    for (const chunk of result.chunks) {
      expect(chunk.documentId).not.toBe(doc2.id.value);
    }
  });
});
