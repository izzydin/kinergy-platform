import { RetrievalResult } from '../models/retrieval-result.model';
import { RetrievedChunk } from '../models/retrieved-chunk.model';
import { RetrievalQuery } from '../value-objects/retrieval-query.vo';
import { RetrievalCriteria } from '../value-objects/retrieval-criteria.vo';
import { RetrievalProvenance } from '../value-objects/retrieval-provenance.vo';
import { SimilarityScore } from '../value-objects/similarity-score.vo';
import { SemanticRetrievalResponse } from '../models/retrieval-response.model';
import { ChunkId } from '../value-objects/chunk-id.vo';
import { VisibilityScope } from '../enums/visibility-scope.enum';

describe('SemanticRetrievalResponse Contract', () => {
  const criteria = RetrievalCriteria.create({
    tenantId: 'tenant_clinic_a',
    generationId: 'gen_active_1',
    documentIds: ['doc_101'],
    allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
    mimeTypes: ['application/pdf'],
    metadataFilter: { department: 'kinesiology' },
  });

  const query = RetrievalQuery.create({
    query: 'Shoulder impingement physical therapy guidelines',
    criteria,
    topK: 5,
    minSimilarity: 0.6,
  });

  const provenance = RetrievalProvenance.create({
    documentTitle: 'Rotator Cuff Protocol',
    documentVersionNumber: 1,
    originalFileName: 'rotator-cuff.pdf',
    mimeType: 'application/pdf',
    chunkSequence: 2,
    chunkId: 'chk_101_02',
    documentId: 'doc_101',
    documentVersionId: 'ver_101_v1',
    sourceLocator: 's3://kynergy/rotator-cuff.pdf',
    pageNumber: 4,
    headingPath: ['Rehabilitation Phase 1', 'Passive Range of Motion'],
    language: 'en',
  });

  const chunk = RetrievedChunk.create({
    id: 'emb_101_02',
    chunkId: ChunkId.fromString('chk_101_02'),
    documentId: 'doc_101',
    documentVersionId: 'ver_101_v1',
    indexGenerationId: 'gen_active_1',
    content: 'Phase 1 emphasizes passive range of motion within pain tolerance up to 90 degrees.',
    tokenCount: 45,
    similarity: SimilarityScore.create(0.8523),
    distance: 0.1477,
    provenance,
    metadata: { author: 'Dr. Jane Smith', department: 'kinesiology' },
  });

  const retrievalResult = RetrievalResult.create({
    query,
    chunks: [chunk],
    totalMatches: 1,
    activeGenerationId: 'gen_active_1',
    executionDurationMs: 42.5,
    embeddingDurationMs: 25.1,
    searchDurationMs: 14.8,
  });

  it('should format a RetrievalResult into a production-grade SemanticRetrievalResponse', () => {
    const response = retrievalResult.toResponse({
      requestId: 'req_test_123',
      modelProfile: 'bge-m3-dense-v1',
      dimensions: 1024,
    });

    expect(response).toBeInstanceOf(SemanticRetrievalResponse);
    expect(response.requestId).toBe('req_test_123');

    // 1. Retrieved content
    expect(response.chunks).toHaveLength(1);
    expect(response.chunks[0]?.content).toBe(
      'Phase 1 emphasizes passive range of motion within pain tolerance up to 90 degrees.',
    );

    // 2. Similarity score
    expect(response.chunks[0]?.similarity).toEqual({
      score: 0.8523,
      distance: 0.1477,
      metric: 'cosine',
    });

    // 3. Source provenance
    expect(response.chunks[0]?.provenance).toEqual({
      chunkId: 'chk_101_02',
      documentId: 'doc_101',
      documentTitle: 'Rotator Cuff Protocol',
      documentVersionId: 'ver_101_v1',
      documentVersionNumber: 1,
      originalFileName: 'rotator-cuff.pdf',
      mimeType: 'application/pdf',
      chunkSequence: 2,
      pageNumber: 4,
      sectionHierarchy: ['Rehabilitation Phase 1', 'Passive Range of Motion'],
      sourceLocator: 's3://kynergy/rotator-cuff.pdf',
      startChar: undefined,
      endChar: undefined,
      language: 'en',
    });

    // 4. Retrieval metadata
    expect(response.metadata).toEqual({
      tenantId: 'tenant_clinic_a',
      requestedTopK: 5,
      returnedCount: 1,
      totalMatchesFound: 1,
      similarityThreshold: 0.6,
      searchMode: 'SEMANTIC',
      filterCategoriesApplied: ['documentIds', 'visibilityScope', 'mimeTypes', 'metadataFilter'],
    });

    // 5. Execution diagnostics
    expect(response.diagnostics.totalDurationMs).toBe(42.5);
    expect(response.diagnostics.embeddingDurationMs).toBe(25.1);
    expect(response.diagnostics.vectorSearchDurationMs).toBe(14.8);
    expect(response.diagnostics.activeGenerationId).toBe('gen_active_1');
    expect(response.diagnostics.modelProfile).toBe('bge-m3-dense-v1');
    expect(response.diagnostics.dimensions).toBe(1024);
  });

  it('should format empty retrieval result without error', () => {
    const emptyResult = RetrievalResult.empty(query, 'gen_active_1', 12.3);
    const response = emptyResult.toResponse({ requestId: 'req_empty_456' });

    expect(response.requestId).toBe('req_empty_456');
    expect(response.chunks).toHaveLength(0);
    expect(response.metadata.returnedCount).toBe(0);
    expect(response.metadata.totalMatchesFound).toBe(0);
  });
});
