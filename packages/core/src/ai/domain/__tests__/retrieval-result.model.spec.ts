import { RetrievalResult } from '../models/retrieval-result.model';
import { RetrievedChunk } from '../models/retrieved-chunk.model';
import { RetrievalQuery } from '../value-objects/retrieval-query.vo';
import { RetrievalCriteria } from '../value-objects/retrieval-criteria.vo';
import { RetrievalProvenance } from '../value-objects/retrieval-provenance.vo';

describe('RetrievalResult Domain Model', () => {
  const criteria = RetrievalCriteria.create({ tenantId: 'tenant-101' });
  const query = RetrievalQuery.create({ query: 'patellar tendonitis', criteria });

  const provenance = RetrievalProvenance.create({
    documentTitle: 'Knee Protocol',
    documentVersionNumber: 1,
    originalFileName: 'knee.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    chunkSequence: 1,
  });

  const chunk1 = RetrievedChunk.create({
    id: 'emb-1',
    chunkId: 'chunk-1',
    documentId: 'doc-1',
    documentVersionId: 'ver-1',
    indexGenerationId: 'gen-1',
    content: 'Tendonitis protocol phase 1.',
    tokenCount: 25,
    similarity: 0.92,
    distance: 0.08,
    provenance,
  });

  const chunk2 = RetrievedChunk.create({
    id: 'emb-2',
    chunkId: 'chunk-2',
    documentId: 'doc-1',
    documentVersionId: 'ver-1',
    indexGenerationId: 'gen-1',
    content: 'Tendonitis protocol phase 2 eccentric load.',
    tokenCount: 30,
    similarity: 0.74,
    distance: 0.26,
    provenance,
  });

  it('should instantiate RetrievalResult with metrics and chunks', () => {
    const result = RetrievalResult.create({
      query,
      chunks: [chunk1, chunk2],
      totalMatches: 2,
      activeGenerationId: 'gen-1',
      executionDurationMs: 42,
      embeddingDurationMs: 15,
      searchDurationMs: 27,
    });

    expect(result.count).toBe(2);
    expect(result.isEmpty()).toBe(false);
    expect(result.topMatch()?.id).toBe('emb-1');
    expect(result.executionDurationMs).toBe(42);
    expect(result.embeddingDurationMs).toBe(15);
    expect(result.searchDurationMs).toBe(27);
  });

  it('should create empty result correctly', () => {
    const emptyResult = RetrievalResult.empty(query, 'gen-1', 10);
    expect(emptyResult.isEmpty()).toBe(true);
    expect(emptyResult.count).toBe(0);
    expect(emptyResult.topMatch()).toBeNull();
  });

  it('should filter chunks by minimum similarity threshold', () => {
    const result = RetrievalResult.create({
      query,
      chunks: [chunk1, chunk2],
      totalMatches: 2,
      activeGenerationId: 'gen-1',
      executionDurationMs: 30,
    });

    const filtered = result.filterByMinSimilarity(0.85);
    expect(filtered.count).toBe(1);
    expect(filtered.chunks[0]?.id).toBe('emb-1');
  });
});
