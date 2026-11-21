import { SecureSemanticSearchService } from '../secure-semantic-search.service';
import { RetrievalSecurityPolicyService } from '../retrieval-security-policy.service';
import { RetrievalObservabilityService } from '../retrieval-observability.service';
import {
  IQueryEmbeddingUseCase,
  ISemanticRetrievalPort,
  IIndexGenerationRepositoryPort,
  IndexGeneration,
  VisibilityScope,
  UnauthorizedRetrievalException,
  EmptyRetrievalQueryException,
  InvalidMetadataFilterException,
  VectorValues,
  RetrievedChunk,
  RetrievalProvenance,
  SimilarityScore,
  RetrievalProviderException,
  RetrievalDatabaseException,
  SemanticRetrievalResponse,
} from '@kinergy-platform/core';

describe('SecureSemanticSearchService Unit Tests', () => {
  let service: SecureSemanticSearchService;
  let observability: RetrievalObservabilityService;
  let mockEmbeddingUseCase: jest.Mocked<IQueryEmbeddingUseCase>;
  let mockRetrievalRepo: jest.Mocked<ISemanticRetrievalPort>;
  let mockGenerationRepo: jest.Mocked<IIndexGenerationRepositoryPort>;
  let mockSecurityPolicy: jest.Mocked<RetrievalSecurityPolicyService>;

  const tenantId = 'tenant_secure_search_test';
  const query = 'rehabilitación de rodilla';

  beforeEach(() => {
    observability = new RetrievalObservabilityService();
    mockEmbeddingUseCase = {
      generateQueryEmbedding: jest.fn(),
    };
    mockRetrievalRepo = {
      search: jest.fn(),
      countMatches: jest.fn(),
    };
    mockGenerationRepo = {
      findById: jest.fn(),
      findActiveByTenantId: jest.fn(),
      findLatestGenerationNumber: jest.fn(),
      listByTenantId: jest.fn(),
      save: jest.fn(),
      promoteGeneration: jest.fn(),
    };
    mockSecurityPolicy = {
      resolveAllowedVisibilityScopes: jest.fn(),
      resolveAuthorizedDocumentIds: jest.fn(),
    } as unknown as jest.Mocked<RetrievalSecurityPolicyService>;

    service = new SecureSemanticSearchService(
      mockEmbeddingUseCase,
      mockRetrievalRepo,
      mockGenerationRepo,
      mockSecurityPolicy,
      undefined,
      observability,
    );
  });

  it('1. should reject execution when tenantId is missing or empty', async () => {
    await expect(
      service.execute({
        query: 'test',
        authContext: {
          tenantId: '',
          userId: 'u1',
          roles: ['Trainer'],
          allowedVisibilityScopes: [],
        },
      }),
    ).rejects.toThrow(UnauthorizedRetrievalException);
  });

  it('2. should reject execution when query string is empty', async () => {
    await expect(
      service.execute({
        query: '   ',
        authContext: {
          tenantId,
          userId: 'u1',
          roles: ['Trainer'],
          allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
        },
      }),
    ).rejects.toThrow(EmptyRetrievalQueryException);
  });

  it('3. should fail closed and return empty result when user has 0 authorized scopes', async () => {
    mockSecurityPolicy.resolveAllowedVisibilityScopes.mockReturnValue([]);

    const result = await service.execute({
      query,
      authContext: { tenantId, userId: 'u1', roles: ['UnknownRole'], allowedVisibilityScopes: [] },
    });

    expect(result.isEmpty()).toBe(true);
    expect(result.count).toBe(0);
    expect(mockEmbeddingUseCase.generateQueryEmbedding).not.toHaveBeenCalled();
    expect(mockRetrievalRepo.search).not.toHaveBeenCalled();
  });

  it('4. should fail closed and return empty result when requested document subset is completely denied', async () => {
    mockSecurityPolicy.resolveAllowedVisibilityScopes.mockReturnValue([VisibilityScope.ALL_STAFF]);
    mockSecurityPolicy.resolveAuthorizedDocumentIds.mockResolvedValue({
      authorizedDocumentIds: [],
      isDenied: true,
    });

    const result = await service.execute({
      query,
      documentIds: ['doc_unauthorized_1'],
      authContext: {
        tenantId,
        userId: 'u1',
        roles: ['Trainer'],
        allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
      },
    });

    expect(result.isEmpty()).toBe(true);
    expect(result.count).toBe(0);
    expect(mockEmbeddingUseCase.generateQueryEmbedding).not.toHaveBeenCalled();
    expect(mockRetrievalRepo.search).not.toHaveBeenCalled();
  });

  it('5. should reject non-allowlisted metadata filter keys with InvalidMetadataFilterException', async () => {
    mockSecurityPolicy.resolveAllowedVisibilityScopes.mockReturnValue([VisibilityScope.ALL_STAFF]);
    mockSecurityPolicy.resolveAuthorizedDocumentIds.mockResolvedValue({
      authorizedDocumentIds: undefined,
      isDenied: false,
    });

    await expect(
      service.execute({
        query,
        filterMetadata: { unallowedKey: 'bad' },
        authContext: {
          tenantId,
          userId: 'u1',
          roles: ['Trainer'],
          allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
        },
      }),
    ).rejects.toThrow(InvalidMetadataFilterException);
  });

  it('6. should return empty result when tenant has no ACTIVE index generation', async () => {
    mockSecurityPolicy.resolveAllowedVisibilityScopes.mockReturnValue([VisibilityScope.ALL_STAFF]);
    mockSecurityPolicy.resolveAuthorizedDocumentIds.mockResolvedValue({
      authorizedDocumentIds: undefined,
      isDenied: false,
    });
    mockGenerationRepo.findActiveByTenantId.mockResolvedValue(null);

    const result = await service.execute({
      query,
      authContext: {
        tenantId,
        userId: 'u1',
        roles: ['Trainer'],
        allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
      },
    });

    expect(result.isEmpty()).toBe(true);
    expect(result.count).toBe(0);
    expect(mockEmbeddingUseCase.generateQueryEmbedding).not.toHaveBeenCalled();
  });

  it('7. should successfully execute authorized retrieval and return hydrated RetrievalResult', async () => {
    mockSecurityPolicy.resolveAllowedVisibilityScopes.mockReturnValue([VisibilityScope.ALL_STAFF]);
    mockSecurityPolicy.resolveAuthorizedDocumentIds.mockResolvedValue({
      authorizedDocumentIds: ['doc_1'],
      isDenied: false,
    });

    const dummyGen = {
      id: { value: 'gen_001' },
      profile: { profileId: 'bge-m3-dense-v1' },
    } as unknown as IndexGeneration;
    mockGenerationRepo.findActiveByTenantId.mockResolvedValue(dummyGen);

    const dummyVector = VectorValues.create(new Array(1024).fill(0.01), 1024);
    mockEmbeddingUseCase.generateQueryEmbedding.mockResolvedValue({
      vector: dummyVector,
      dimensions: 1024,
      modelIdentifier: 'bge-m3:latest',
      durationMs: 15,
      normalizedQuery: query,
    });

    const sampleChunk = RetrievedChunk.create({
      id: 'emb_1',
      chunkId: 'chk_1',
      documentId: 'doc_1',
      documentVersionId: 'ver_1',
      indexGenerationId: 'gen_001',
      content: 'Protocolo de readaptación funcional.',
      tokenCount: 6,
      similarity: SimilarityScore.create(0.92),
      distance: 0.08,
      provenance: RetrievalProvenance.create({
        documentTitle: 'Guía de Kinesiología',
        documentVersionNumber: 1,
        originalFileName: 'guia.pdf',
        mimeType: 'application/pdf',
        chunkSequence: 0,
      }),
    });

    mockRetrievalRepo.search.mockResolvedValue([sampleChunk]);
    mockRetrievalRepo.countMatches.mockResolvedValue(1);

    const result = await service.execute({
      query,
      documentIds: ['doc_1'],
      filterMetadata: { department: 'kinesiology' },
      authContext: {
        tenantId,
        userId: 'u1',
        roles: ['Trainer'],
        allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
      },
      topK: 5,
    });

    expect(result.isEmpty()).toBe(false);
    expect(result.count).toBe(1);
    expect(result.chunks[0]?.id).toBe('emb_1');
    expect(result.activeGenerationId).toBe('gen_001');
    expect(result.totalMatches).toBe(1);
    expect(mockRetrievalRepo.search).toHaveBeenCalledWith(
      dummyVector.values,
      expect.objectContaining({
        topK: 5,
      }),
    );
  });

  it('8. should execute and format into a complete SemanticRetrievalResponse', async () => {
    mockSecurityPolicy.resolveAllowedVisibilityScopes.mockReturnValue([VisibilityScope.ALL_STAFF]);
    mockSecurityPolicy.resolveAuthorizedDocumentIds.mockResolvedValue({
      authorizedDocumentIds: undefined,
      isDenied: false,
    });

    const dummyGen = {
      id: { value: 'gen_001' },
      profile: { profileId: 'bge-m3-dense-v1' },
    } as unknown as IndexGeneration;
    mockGenerationRepo.findActiveByTenantId.mockResolvedValue(dummyGen);

    const dummyVector = VectorValues.create(new Array(1024).fill(0.01), 1024);
    mockEmbeddingUseCase.generateQueryEmbedding.mockResolvedValue({
      vector: dummyVector,
      dimensions: 1024,
      modelIdentifier: 'bge-m3:latest',
      durationMs: 15,
      normalizedQuery: query,
    });

    const sampleChunk = RetrievedChunk.create({
      id: 'emb_1',
      chunkId: 'chk_1',
      documentId: 'doc_1',
      documentVersionId: 'ver_1',
      indexGenerationId: 'gen_001',
      content: 'Protocolo de readaptación funcional.',
      tokenCount: 6,
      similarity: SimilarityScore.create(0.92),
      distance: 0.08,
      provenance: RetrievalProvenance.create({
        documentTitle: 'Guía de Kinesiología',
        documentVersionNumber: 1,
        originalFileName: 'guia.pdf',
        mimeType: 'application/pdf',
        chunkSequence: 0,
      }),
    });

    mockRetrievalRepo.search.mockResolvedValue([sampleChunk]);
    mockRetrievalRepo.countMatches.mockResolvedValue(1);

    const response = await service.executeAndFormat({
      query,
      authContext: {
        tenantId,
        userId: 'u1',
        roles: ['Trainer'],
        allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
      },
      topK: 5,
      requestId: 'custom_req_999',
    });

    expect(response).toBeInstanceOf(SemanticRetrievalResponse);
    expect(response.requestId).toBe('custom_req_999');
    expect(response.chunks).toHaveLength(1);
    expect(response.chunks[0]?.content).toBe('Protocolo de readaptación funcional.');
    expect(response.chunks[0]?.similarity.score).toBe(0.92);
    expect(response.diagnostics.activeGenerationId).toBe('gen_001');
    expect(response.diagnostics.dimensions).toBe(1024);
  });

  it('9. should handle provider failure by throwing RetrievalProviderException and recording metrics', async () => {
    mockSecurityPolicy.resolveAllowedVisibilityScopes.mockReturnValue([VisibilityScope.ALL_STAFF]);
    mockSecurityPolicy.resolveAuthorizedDocumentIds.mockResolvedValue({
      authorizedDocumentIds: undefined,
      isDenied: false,
    });

    const dummyGen = {
      id: { value: 'gen_001' },
      profile: { profileId: 'bge-m3-dense-v1' },
    } as unknown as IndexGeneration;
    mockGenerationRepo.findActiveByTenantId.mockResolvedValue(dummyGen);

    mockEmbeddingUseCase.generateQueryEmbedding.mockRejectedValue(
      new Error('Ollama provider timeout after 10000ms'),
    );

    await expect(
      service.execute({
        query,
        authContext: {
          tenantId,
          userId: 'u1',
          roles: ['Trainer'],
          allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
        },
      }),
    ).rejects.toThrow(RetrievalProviderException);

    const metrics = service.getObservabilitySummary();
    expect(metrics.totalRequests).toBe(1);
    expect(metrics.providerTimeoutCount).toBe(1);
    expect(metrics.errorRate).toBe(1.0);
  });

  it('10. should handle database failure by throwing RetrievalDatabaseException without leaking raw SQL', async () => {
    mockSecurityPolicy.resolveAllowedVisibilityScopes.mockReturnValue([VisibilityScope.ALL_STAFF]);
    mockSecurityPolicy.resolveAuthorizedDocumentIds.mockResolvedValue({
      authorizedDocumentIds: undefined,
      isDenied: false,
    });

    const dummyGen = {
      id: { value: 'gen_001' },
      profile: { profileId: 'bge-m3-dense-v1' },
    } as unknown as IndexGeneration;
    mockGenerationRepo.findActiveByTenantId.mockResolvedValue(dummyGen);

    const dummyVector = VectorValues.create(new Array(1024).fill(0.01), 1024);
    mockEmbeddingUseCase.generateQueryEmbedding.mockResolvedValue({
      vector: dummyVector,
      dimensions: 1024,
      modelIdentifier: 'bge-m3:latest',
      durationMs: 15,
      normalizedQuery: query,
    });

    mockRetrievalRepo.search.mockRejectedValue(
      new Error('PrismaClientKnownRequestError: relation "document_embeddings" does not exist'),
    );

    let thrownError: unknown;
    try {
      await service.execute({
        query,
        authContext: {
          tenantId,
          userId: 'u1',
          roles: ['Trainer'],
          allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
        },
      });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(RetrievalDatabaseException);
    expect((thrownError as Error).message).not.toContain(
      'relation "document_embeddings" does not exist',
    );
    expect((thrownError as Error).message).toContain('persistence error occurred during retrieval');

    const metrics = service.getObservabilitySummary();
    expect(metrics.databaseFailureCount).toBe(1);
  });

  it('11. should validate and pass allowlisted contextual metadata filters to retrieval criteria', async () => {
    mockSecurityPolicy.resolveAllowedVisibilityScopes.mockReturnValue([VisibilityScope.ALL_STAFF]);
    mockSecurityPolicy.resolveAuthorizedDocumentIds.mockResolvedValue({
      authorizedDocumentIds: undefined,
      isDenied: false,
    });

    const dummyGen = {
      id: { value: 'gen_001' },
      profile: { profileId: 'bge-m3-dense-v1' },
    } as unknown as IndexGeneration;
    mockGenerationRepo.findActiveByTenantId.mockResolvedValue(dummyGen);

    const dummyVector = VectorValues.create(new Array(1024).fill(0.01), 1024);
    mockEmbeddingUseCase.generateQueryEmbedding.mockResolvedValue({
      vector: dummyVector,
      dimensions: 1024,
      modelIdentifier: 'bge-m3:latest',
      durationMs: 15,
      normalizedQuery: query,
    });
    mockRetrievalRepo.search.mockResolvedValue([]);
    mockRetrievalRepo.countMatches.mockResolvedValue(0);

    const result = await service.execute({
      query,
      authContext: {
        tenantId,
        userId: 'u1',
        roles: ['Trainer'],
        allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
      },
      filterMetadata: {
        department: 'kinesiology',
        category: 'protocols',
        language: 'es',
      },
    });

    expect(result).toBeDefined();
    expect(mockRetrievalRepo.search).toHaveBeenCalled();
    const passedQuery = mockRetrievalRepo.search.mock.calls[0]![1];
    expect(passedQuery.criteria.metadataFilter).toBeDefined();
    expect(passedQuery.criteria.metadataFilter?.['department']).toBe('kinesiology');
    expect(passedQuery.criteria.metadataFilter?.['category']).toBe('protocols');
    expect(passedQuery.criteria.metadataFilter?.['language']).toBe('es');
  });

  it('12. should reject search execution when filterMetadata contains unallowlisted keys or spoofed tenant boundaries', async () => {
    mockSecurityPolicy.resolveAllowedVisibilityScopes.mockReturnValue([VisibilityScope.ALL_STAFF]);
    mockSecurityPolicy.resolveAuthorizedDocumentIds.mockResolvedValue({
      authorizedDocumentIds: undefined,
      isDenied: false,
    });

    await expect(
      service.execute({
        query,
        authContext: {
          tenantId,
          userId: 'u1',
          roles: ['Trainer'],
          allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
        },
        filterMetadata: {
          tenant_id: 'spoofed_tenant_bypass',
        },
      }),
    ).rejects.toThrow(InvalidMetadataFilterException);
  });
});
