import { RetrievedChunk } from '../models/retrieved-chunk.model';
import { ChunkId } from '../value-objects/chunk-id.vo';
import { RetrievalProvenance } from '../value-objects/retrieval-provenance.vo';
import { InvalidRetrievalQueryException } from '../exceptions/retrieval.exceptions';

describe('RetrievedChunk Domain Model', () => {
  const provenance = RetrievalProvenance.create({
    documentTitle: 'Clinical Guidelines 2026',
    documentVersionNumber: 1,
    originalFileName: 'guidelines.pdf',
    mimeType: 'application/pdf',
    chunkSequence: 3,
    headingPath: ['Section 2', 'Physical Therapy'],
    language: 'es',
  });

  it('should instantiate a valid retrieved chunk with all fields', () => {
    const chunk = RetrievedChunk.create({
      id: 'emb-uuid-1',
      chunkId: 'chunk-uuid-1',
      documentId: 'doc-uuid-1',
      documentVersionId: 'ver-uuid-1',
      indexGenerationId: 'gen-uuid-1',
      content: 'Ejercicio de movilidad articular en decúbito supino.',
      tokenCount: 45,
      similarity: 0.88,
      distance: 0.12,
      provenance,
    });

    expect(chunk.id).toBe('emb-uuid-1');
    expect(chunk.chunkId).toBeInstanceOf(ChunkId);
    expect(chunk.documentId).toBe('doc-uuid-1');
    expect(chunk.similarity.value).toBe(0.88);
    expect(chunk.distance).toBe(0.12);
    expect(chunk.provenance.documentTitle).toBe('Clinical Guidelines 2026');
  });

  it('should reject empty or whitespace content', () => {
    expect(() =>
      RetrievedChunk.create({
        id: 'emb-1',
        chunkId: 'chunk-1',
        documentId: 'doc-1',
        documentVersionId: 'ver-1',
        indexGenerationId: 'gen-1',
        content: '   ',
        tokenCount: 10,
        similarity: 0.8,
        distance: 0.2,
        provenance,
      }),
    ).toThrow(InvalidRetrievalQueryException);
  });

  it('should reject negative token count', () => {
    expect(() =>
      RetrievedChunk.create({
        id: 'emb-1',
        chunkId: 'chunk-1',
        documentId: 'doc-1',
        documentVersionId: 'ver-1',
        indexGenerationId: 'gen-1',
        content: 'Valid content',
        tokenCount: -1,
        similarity: 0.8,
        distance: 0.2,
        provenance,
      }),
    ).toThrow(InvalidRetrievalQueryException);
  });
});
