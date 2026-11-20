import { DocumentEmbedding } from '../models/document-embedding.entity';
import { EmbeddingProfile } from '../value-objects/embedding-profile.vo';
import { ChunkId } from '../value-objects/chunk-id.vo';
import { IndexGenerationId } from '../value-objects/index-generation-id.vo';
import { EmbeddingValidationException } from '../exceptions/vector-indexing.exceptions';

describe('DocumentEmbedding Entity', () => {
  const profile = EmbeddingProfile.createBgeM3Default();
  const chunkId = ChunkId.create('chk_sample_123');
  const generationId = IndexGenerationId.create('idxgen_gen_1');
  const sample1024Floats = new Array(1024).fill(0).map((_, i) => Math.sin(i));
  // Normalize
  const norm = Math.sqrt(sample1024Floats.reduce((s, x) => s + x * x, 0));
  const normalizedFloats = sample1024Floats.map((x) => x / norm);

  it('should create a valid DocumentEmbedding with all domain fields', () => {
    const embedding = DocumentEmbedding.create({
      chunkId,
      documentId: 'doc-uuid-1',
      documentVersionId: 'ver-uuid-1',
      indexGenerationId: generationId,
      profile,
      vector: normalizedFloats,
      contentFingerprint: 'sha256:abc123def456',
    });

    expect(embedding).toBeDefined();
    expect(embedding.chunkId.value).toBe(chunkId.value);
    expect(embedding.documentId).toBe('doc-uuid-1');
    expect(embedding.documentVersionId).toBe('ver-uuid-1');
    expect(embedding.indexGenerationId.value).toBe(generationId.value);
    expect(embedding.embeddingProfileId).toBe(profile.profileId);
    expect(embedding.dimensions).toBe(1024);
    expect(embedding.vector.dimensions).toBe(1024);
    expect(embedding.contentFingerprint).toBe('sha256:abc123def456');
    expect(embedding.createdAt).toBeInstanceOf(Date);
  });

  it('should reject vector whose dimensions do not match the profile', () => {
    const wrongDimensionFloats = [0.1, 0.2, 0.3]; // 3 dims instead of 1024

    expect(() =>
      DocumentEmbedding.create({
        chunkId,
        documentId: 'doc-uuid-1',
        documentVersionId: 'ver-uuid-1',
        indexGenerationId: generationId,
        profile,
        vector: wrongDimensionFloats,
        contentFingerprint: 'sha256:abc123def456',
      }),
    ).toThrow(EmbeddingValidationException);
  });

  it('should reject missing or empty document provenance identifiers', () => {
    expect(() =>
      DocumentEmbedding.create({
        chunkId,
        documentId: '   ',
        documentVersionId: 'ver-uuid-1',
        indexGenerationId: generationId,
        profile,
        vector: normalizedFloats,
        contentFingerprint: 'sha256:abc123def456',
      }),
    ).toThrow(EmbeddingValidationException);

    expect(() =>
      DocumentEmbedding.create({
        chunkId,
        documentId: 'doc-uuid-1',
        documentVersionId: '',
        indexGenerationId: generationId,
        profile,
        vector: normalizedFloats,
        contentFingerprint: 'sha256:abc123def456',
      }),
    ).toThrow(EmbeddingValidationException);
  });

  it('should reconstitute an existing DocumentEmbedding without validation overhead', () => {
    const reconstituted = DocumentEmbedding.reconstitute({
      id: 'emb_123',
      chunkId: 'chk_456',
      documentId: 'doc_789',
      documentVersionId: 'ver_012',
      indexGenerationId: 'idxgen_345',
      embeddingProfileId: profile.profileId,
      dimensions: 1024,
      vector: normalizedFloats,
      contentFingerprint: 'sha256:reconstituted_hash',
      createdAt: new Date('2026-11-20T00:00:00Z'),
    });

    expect(reconstituted.id.value).toBe('emb_123');
    expect(reconstituted.chunkId.value).toBe('chk_456');
    expect(reconstituted.dimensions).toBe(1024);
    expect(reconstituted.createdAt.toISOString()).toBe('2026-11-20T00:00:00.000Z');
  });
});
