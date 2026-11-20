import { DocumentChunk } from '../models/document-chunk.entity';
import { ChunkProvenance } from '../value-objects/chunk-provenance.vo';
import { ChunkId } from '../value-objects/chunk-id.vo';
import { DocumentValidationException } from '../exceptions/knowledge-document.exceptions';

describe('DocumentChunk Domain Entity', () => {
  const validChecksum = 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e';

  function createValidProvenance(
    overrides: Partial<Parameters<typeof ChunkProvenance.create>[0]> = {},
  ) {
    return ChunkProvenance.create({
      documentId: 'doc-001',
      documentVersionId: 'ver-001',
      chunkIndex: 0,
      pageNumber: 1,
      sectionHierarchy: ['Manual Clínico', 'Capítulo 1'],
      sourceBlockIds: ['blk-1'],
      language: 'es',
      checksum: validChecksum,
      configurationVersion: 'v1-target450',
      ...overrides,
    });
  }

  it('creates an immutable DocumentChunk with valid attributes and provenance', () => {
    const prov = createValidProvenance();
    const chunk = DocumentChunk.create({
      id: 'chk-001',
      documentId: 'doc-001',
      documentVersionId: 'ver-001',
      sequence: 0,
      content: 'Este es el texto del primer fragmento de conocimiento clínico.',
      tokenCount: 450,
      language: 'es',
      provenance: prov,
    });

    expect(chunk.id.value).toBe('chk-001');
    expect(chunk.documentId).toBe('doc-001');
    expect(chunk.documentVersionId).toBe('ver-001');
    expect(chunk.sequence).toBe(0);
    expect(chunk.content).toBe('Este es el texto del primer fragmento de conocimiento clínico.');
    expect(chunk.tokenCount).toBe(450);
    expect(chunk.language).toBe('es');
    expect(chunk.checksum).toBe(validChecksum);
    expect(chunk.charCount).toBe(62);

    // Deep immutability verification
    expect(() => {
      (chunk as { content: string }).content = 'Modificado';
    }).toThrow();
  });

  it('accepts ChunkId VO as id input', () => {
    const chunkId = ChunkId.create('chk-custom-id');
    const prov = createValidProvenance();
    const chunk = DocumentChunk.create({
      id: chunkId,
      documentId: 'doc-001',
      documentVersionId: 'ver-001',
      sequence: 0,
      content: 'Contenido válido',
      tokenCount: 100,
      provenance: prov,
    });

    expect(chunk.id.equals(chunkId)).toBe(true);
  });

  it('enforces that provenance.documentId matches chunk.documentId', () => {
    const prov = createValidProvenance({ documentId: 'doc-different' });

    expect(() =>
      DocumentChunk.create({
        documentId: 'doc-001',
        documentVersionId: 'ver-001',
        sequence: 0,
        content: 'Contenido',
        tokenCount: 50,
        provenance: prov,
      }),
    ).toThrow(DocumentValidationException);
  });

  it('enforces that provenance.documentVersionId matches chunk.documentVersionId', () => {
    const prov = createValidProvenance({ documentVersionId: 'ver-other' });

    expect(() =>
      DocumentChunk.create({
        documentId: 'doc-001',
        documentVersionId: 'ver-001',
        sequence: 0,
        content: 'Contenido',
        tokenCount: 50,
        provenance: prov,
      }),
    ).toThrow(DocumentValidationException);
  });

  it('enforces that provenance.chunkIndex matches chunk.sequence', () => {
    const prov = createValidProvenance({ chunkIndex: 5 });

    expect(() =>
      DocumentChunk.create({
        documentId: 'doc-001',
        documentVersionId: 'ver-001',
        sequence: 0, // Mismatch: 0 != 5!
        content: 'Contenido',
        tokenCount: 50,
        provenance: prov,
      }),
    ).toThrow(DocumentValidationException);
  });

  it('rejects empty content', () => {
    const prov = createValidProvenance();

    expect(() =>
      DocumentChunk.create({
        documentId: 'doc-001',
        documentVersionId: 'ver-001',
        sequence: 0,
        content: '   \n  ',
        tokenCount: 50,
        provenance: prov,
      }),
    ).toThrow(DocumentValidationException);
  });

  it('rejects invalid token count (<= 0 or non-integer)', () => {
    const prov = createValidProvenance();

    expect(() =>
      DocumentChunk.create({
        documentId: 'doc-001',
        documentVersionId: 'ver-001',
        sequence: 0,
        content: 'Contenido',
        tokenCount: 0,
        provenance: prov,
      }),
    ).toThrow(DocumentValidationException);

    expect(() =>
      DocumentChunk.create({
        documentId: 'doc-001',
        documentVersionId: 'ver-001',
        sequence: 0,
        content: 'Contenido',
        tokenCount: -10,
        provenance: prov,
      }),
    ).toThrow(DocumentValidationException);
  });

  it('rejects negative sequence numbers', () => {
    const prov = createValidProvenance({ chunkIndex: 0 });

    expect(() =>
      DocumentChunk.create({
        documentId: 'doc-001',
        documentVersionId: 'ver-001',
        sequence: -1,
        content: 'Contenido',
        tokenCount: 50,
        provenance: prov,
      }),
    ).toThrow(DocumentValidationException);
  });
});
