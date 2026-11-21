import { PrismaClient } from '@prisma/client';
import { SecureSemanticSearchService } from '../secure-semantic-search.service';
import { RetrievalSecurityPolicyService } from '../retrieval-security-policy.service';
import { RetrievalObservabilityService } from '../retrieval-observability.service';
import {
  KnowledgeDocument,
  DocumentChunk,
  DocumentEmbedding,
  IndexGeneration,
  EmbeddingProfile,
  ChunkId,
  ChunkProvenance,
  VisibilityScope,
  RetrievalSearchMode,
  IQueryEmbeddingUseCase,
  VectorValues,
} from '@kinergy-platform/core';
import {
  PrismaSemanticRetrievalRepository,
  PrismaLexicalRetrievalRepository,
  PrismaKnowledgeDocumentRepository,
  PrismaKnowledgeChunkRepository,
  PrismaIndexGenerationRepository,
  PrismaVectorStoreRepository,
} from '@kinergy-platform/core/server';
import { DEFAULT_AI_CONFIG } from '../../../config/ai.config';

describe('AI-07.2 — Hybrid Retrieval & Reciprocal Rank Fusion Integration', () => {
  let prisma: PrismaClient;
  let service: SecureSemanticSearchService;
  let semanticRepo: PrismaSemanticRetrievalRepository;
  let lexicalRepo: PrismaLexicalRetrievalRepository;
  let docRepo: PrismaKnowledgeDocumentRepository;
  let chunkRepo: PrismaKnowledgeChunkRepository;
  let genRepo: PrismaIndexGenerationRepository;
  let vectorStore: PrismaVectorStoreRepository;
  let securityPolicy: RetrievalSecurityPolicyService;
  let isDbAvailable = false;

  const tenantA = `tenant_hybrid_a_${Date.now()}`;
  const tenantB = `tenant_hybrid_b_${Date.now()}`;
  const checksum = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  const createNormalized1024Vector = (seed: number): number[] => {
    const raw = new Array(1024).fill(0).map((_, i) => Math.sin(seed * (i + 1)));
    const norm = Math.sqrt(raw.reduce((acc, val) => acc + val * val, 0));
    return raw.map((val) => val / norm);
  };

  const commonVector = createNormalized1024Vector(10.0);

  // Mock Query Embedding Use Case
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

      service = new SecureSemanticSearchService(
        mockQueryEmbeddingUseCase,
        semanticRepo,
        genRepo,
        securityPolicy,
        {
          ...DEFAULT_AI_CONFIG,
          enabled: true,
          llmProvider: 'mock',
          embeddingProvider: 'mock',
          ollamaBaseUrl: 'http://127.0.0.1:11434',
          requestTimeoutMs: 30000,
          healthTimeoutMs: 3000,
          chatModel: 'qwen3:4b',
          chatTemperature: 0.2,
          chatMaxTokens: 512,
          chatContextWindow: 4096,
          chatMaxConcurrent: 1,
          embeddingModel: 'bge-m3:latest',
          embeddingDimensions: 1024,
          embeddingBatchSize: 16,
          embeddingMaxConcurrent: 2,
          healthCheckEnabled: true,
          startupCheckEnabled: false,
          failureThreshold: 3,
          maxDocumentSizeBytes: 10 * 1024 * 1024,
          allowedDocumentMimeTypes: ['application/pdf'],
          targetChunkTokens: 450,
          minimumChunkTokens: 400,
          maximumChunkTokens: 500,
          overlapTokens: 60,
          chunkingStrategy: 'structure-aware',
          retrievalDefaultTopK: 5,
          retrievalMaxTopK: 50,
          retrievalSimilarityThreshold: 0.6,
          retrievalEvaluationProfile: 'bge-m3-dense-v1',
          retrievalSearchMode: 'SEMANTIC',
          retrievalSemanticCandidateLimit: 20,
          retrievalKeywordCandidateLimit: 20,
          retrievalRrfConstant: 60,
          llmModel: 'qwen3:4b',
          timeoutMs: 30000,
          maxParallelGeneration: 1,
        },
        new RetrievalObservabilityService(),
        lexicalRepo,
      );
    } catch {
      isDbAvailable = false;
    }
  });

  afterAll(async () => {
    if (isDbAvailable && prisma) {
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

  it('1. should execute hybrid retrieval combining semantic and keyword candidates via RRF', async () => {
    if (!isDbAvailable) return;

    const profile = EmbeddingProfile.bgeM3DenseDefault();

    // 1. Seed Generation for Tenant A
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

    // 2. Seed Document & Chunks for Tenant A
    const doc = KnowledgeDocument.create({
      tenantId: tenantA,
      title: 'Manual de Fisioterapia Deportiva',
      uploadedBy: 'usr_staff_a',
      visibilityScope: VisibilityScope.ALL_STAFF,
    });
    const ver = doc.addVersion({
      checksum,
      storageKey: 's3://bucket/manual.pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
      originalFileName: 'manual.pdf',
      uploadedBy: 'usr_staff_a',
    });
    await docRepo.save(doc);

    // Chunk 1: High semantic match (same vector) + exact keyword match
    const chunk1 = DocumentChunk.create({
      id: ChunkId.createDeterministic(doc.id.value, ver.id, 1, 'crioterapia lca'),
      documentId: doc.id.value,
      documentVersionId: ver.id,
      sequence: 1,
      content: 'Fase aguda de LCA: uso de crioterapia intermitente y reposo articular.',
      tokenCount: 12,
      provenance: ChunkProvenance.create({
        documentId: doc.id.value,
        documentVersionId: ver.id,
        chunkIndex: 1,
        pageNumber: 1,
        checksum,
        configurationVersion: '1.0.0',
      }),
    });

    // Chunk 2: High semantic match, but different lexical words (synonym only)
    const chunk2 = DocumentChunk.create({
      id: ChunkId.createDeterministic(doc.id.value, ver.id, 2, 'hielo rodilla'),
      documentId: doc.id.value,
      documentVersionId: ver.id,
      sequence: 2,
      content: 'Aplicación de frío local en la articulación femorotibial.',
      tokenCount: 10,
      provenance: ChunkProvenance.create({
        documentId: doc.id.value,
        documentVersionId: ver.id,
        chunkIndex: 2,
        pageNumber: 1,
        checksum,
        configurationVersion: '1.0.0',
      }),
    });
    await chunkRepo.saveChunks(tenantA, doc.id.value, ver.id, [chunk1, chunk2]);

    // Save embeddings matching query vector
    await vectorStore.save(
      DocumentEmbedding.create({
        chunkId: chunk1.id,
        documentId: doc.id.value,
        documentVersionId: ver.id,
        indexGenerationId: genA.id,
        profile,
        vector: commonVector,
        contentFingerprint: 'sha256:fp_1',
      }),
    );
    await vectorStore.save(
      DocumentEmbedding.create({
        chunkId: chunk2.id,
        documentId: doc.id.value,
        documentVersionId: ver.id,
        indexGenerationId: genA.id,
        profile,
        vector: commonVector,
        contentFingerprint: 'sha256:fp_2',
      }),
    );

    // Query in HYBRID mode
    const result = await service.execute({
      query: 'crioterapia reposo',
      authContext: {
        tenantId: tenantA,
        userId: 'usr_staff_a',
        roles: ['staff'],
        allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
      },
      searchMode: RetrievalSearchMode.HYBRID,
      topK: 5,
    });

    expect(result.count).toBeGreaterThanOrEqual(1);
    // Chunk 1 matches in BOTH semantic and lexical arms -> top RRF rank
    expect(result.chunks[0]?.content).toContain('crioterapia');
    const sources = result.chunks[0]?.metadata?.['retrievalSources'] as string[];
    expect(sources).toContain('semantic');
    expect(sources).toContain('keyword');
    expect(result.chunks[0]?.metadata?.['retrievalStrategy']).toBe('HYBRID');
  });

  it('2. should enforce multi-tenant isolation in hybrid mode', async () => {
    if (!isDbAvailable) return;

    const privateCode = 'CodigoSecretoHibrido123';

    // Seed Doc for Tenant B
    const docB = KnowledgeDocument.create({
      tenantId: tenantB,
      title: 'Doc Privado Tenant B',
      uploadedBy: 'usr_staff_b',
      visibilityScope: VisibilityScope.ALL_STAFF,
    });
    const verB = docB.addVersion({
      checksum,
      storageKey: 's3://bucket/doc_b.pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
      originalFileName: 'doc_b.pdf',
      uploadedBy: 'usr_staff_b',
    });
    await docRepo.save(docB);

    const chunkB = DocumentChunk.create({
      id: ChunkId.createDeterministic(docB.id.value, verB.id, 1, privateCode),
      documentId: docB.id.value,
      documentVersionId: verB.id,
      sequence: 1,
      content: `Información clasificada exclusiva de Tenant B: ${privateCode}`,
      tokenCount: 10,
      provenance: ChunkProvenance.create({
        documentId: docB.id.value,
        documentVersionId: verB.id,
        chunkIndex: 1,
        pageNumber: 1,
        checksum,
        configurationVersion: '1.0.0',
      }),
    });
    await chunkRepo.saveChunks(tenantB, docB.id.value, verB.id, [chunkB]);

    // Query under Tenant A looking for Tenant B private code
    const resultA = await service.execute({
      query: privateCode,
      authContext: {
        tenantId: tenantA,
        userId: 'usr_staff_a',
        roles: ['staff'],
        allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
      },
      searchMode: RetrievalSearchMode.HYBRID,
      topK: 5,
    });

    // Tenant A query must NEVER return Tenant B chunk or leak Tenant B's document
    for (const chunk of resultA.chunks) {
      expect(chunk.documentId).not.toBe(docB.id.value);
      expect(chunk.content).not.toContain(privateCode);
    }
    const hasTenantBChunk = resultA.chunks.some((c) => c.documentId === docB.id.value);
    expect(hasTenantBChunk).toBe(false);

    // Tenant B query CAN retrieve its own chunk via lexical match in hybrid mode
    const resultB = await service.execute({
      query: privateCode,
      authContext: {
        tenantId: tenantB,
        userId: 'usr_staff_b',
        roles: ['staff'],
        allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
      },
      searchMode: RetrievalSearchMode.HYBRID,
      topK: 5,
    });
    expect(resultB.count).toBeGreaterThanOrEqual(1);
    expect(resultB.chunks[0]?.content).toContain(privateCode);
  });

  it('3. should support selectable search modes: SEMANTIC, KEYWORD, and HYBRID', async () => {
    if (!isDbAvailable) return;

    // Keyword-only search
    const kwResult = await service.execute({
      query: 'crioterapia',
      authContext: {
        tenantId: tenantA,
        userId: 'usr_staff_a',
        roles: ['staff'],
        allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
      },
      searchMode: RetrievalSearchMode.KEYWORD,
      topK: 5,
    });
    expect(kwResult.count).toBeGreaterThanOrEqual(1);
    expect(kwResult.activeGenerationId).toBe('lexical');

    // Semantic-only search
    const semResult = await service.execute({
      query: 'crioterapia',
      authContext: {
        tenantId: tenantA,
        userId: 'usr_staff_a',
        roles: ['staff'],
        allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
      },
      searchMode: RetrievalSearchMode.SEMANTIC,
      topK: 5,
    });
    expect(semResult.count).toBeGreaterThanOrEqual(1);
    expect(semResult.activeGenerationId).not.toBe('lexical');

    // Hybrid search
    const hybResult = await service.execute({
      query: 'crioterapia',
      authContext: {
        tenantId: tenantA,
        userId: 'usr_staff_a',
        roles: ['staff'],
        allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
      },
      searchMode: RetrievalSearchMode.HYBRID,
      topK: 5,
    });
    expect(hybResult.count).toBeGreaterThanOrEqual(1);
  });

  it('4. should gracefully fall back to keyword candidates when semantic arm is empty', async () => {
    if (!isDbAvailable) return;

    // Temporary tenant without active vector index generation
    const tenantNoGen = `tenant_nogen_${Date.now()}`;
    const docNoGen = KnowledgeDocument.create({
      tenantId: tenantNoGen,
      title: 'Documento Sin Indice Vectorial',
      uploadedBy: 'usr_admin',
      visibilityScope: VisibilityScope.ALL_STAFF,
    });
    const verNoGen = docNoGen.addVersion({
      checksum,
      storageKey: 's3://bucket/nogen.pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
      originalFileName: 'nogen.pdf',
      uploadedBy: 'usr_admin',
    });
    await docRepo.save(docNoGen);

    const chunkNoGen = DocumentChunk.create({
      id: ChunkId.createDeterministic(docNoGen.id.value, verNoGen.id, 1, 'palabra'),
      documentId: docNoGen.id.value,
      documentVersionId: verNoGen.id,
      sequence: 1,
      content: 'Contenido disponible únicamente por coincidencia de palabras clave.',
      tokenCount: 10,
      provenance: ChunkProvenance.create({
        documentId: docNoGen.id.value,
        documentVersionId: verNoGen.id,
        chunkIndex: 1,
        pageNumber: 1,
        checksum,
        configurationVersion: '1.0.0',
      }),
    });
    await chunkRepo.saveChunks(tenantNoGen, docNoGen.id.value, verNoGen.id, [chunkNoGen]);

    const result = await service.execute({
      query: 'coincidencia palabras',
      authContext: {
        tenantId: tenantNoGen,
        userId: 'usr_admin',
        roles: ['admin'],
        allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
      },
      searchMode: RetrievalSearchMode.HYBRID,
      topK: 5,
    });

    // Fused result gracefully returns the keyword match even though semantic arm was empty
    expect(result.count).toBe(1);
    expect(result.chunks[0]?.content).toContain('coincidencia de palabras clave');
    expect(result.chunks[0]?.metadata?.['retrievalSources']).toEqual(['keyword']);

    // Cleanup
    await prisma.knowledgeDocument.deleteMany({ where: { tenantId: tenantNoGen } }).catch(() => {});
  });
});
