import { SourceLocation } from '../value-objects/source-location.vo';
import { ChunkProvenance } from '../value-objects/chunk-provenance.vo';
import { DocumentChecksum } from '../value-objects/document-checksum.vo';
import { DocumentValidationException } from '../exceptions/knowledge-document.exceptions';

describe('SourceProvenance & SourceLocation Value Objects', () => {
  const validChecksum = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  describe('SourceLocation', () => {
    it('creates a valid paginated SourceLocation (PDF)', () => {
      const loc = SourceLocation.create({
        pageNumber: 3,
        startOffset: 120,
        endOffset: 250,
        sectionPath: ['Capítulo 1', 'Sección A'],
      });

      expect(loc.pageNumber).toBe(3);
      expect(loc.startOffset).toBe(120);
      expect(loc.endOffset).toBe(250);
      expect(loc.sectionPath).toEqual(['Capítulo 1', 'Sección A']);
      expect(loc.toReadableString()).toContain('p. 3');
      expect(loc.toReadableString()).toContain('[Capítulo 1 > Sección A]');
    });

    it('creates a valid unpaginated line-based SourceLocation (Markdown / TXT)', () => {
      const loc = SourceLocation.create({
        pageNumber: null,
        startLine: 45,
        endLine: 55,
        sectionPath: ['Instalación'],
      });

      expect(loc.pageNumber).toBeNull();
      expect(loc.startLine).toBe(45);
      expect(loc.endLine).toBe(55);
      expect(loc.toReadableString()).toContain('lines 45-55');
    });

    it('rejects invalid page number (< 1 or non-integer)', () => {
      expect(() => SourceLocation.create({ pageNumber: 0 })).toThrow(DocumentValidationException);
      expect(() => SourceLocation.create({ pageNumber: -1 })).toThrow(DocumentValidationException);
      expect(() => SourceLocation.create({ pageNumber: 1.5 })).toThrow(DocumentValidationException);
    });

    it('rejects endOffset less than startOffset', () => {
      expect(() =>
        SourceLocation.create({
          startOffset: 100,
          endOffset: 50,
        }),
      ).toThrow(DocumentValidationException);
    });

    it('rejects endLine less than startLine', () => {
      expect(() =>
        SourceLocation.create({
          startLine: 10,
          endLine: 5,
        }),
      ).toThrow(DocumentValidationException);
    });
  });

  describe('ChunkProvenance', () => {
    it('creates an immutable ChunkProvenance with valid attributes', () => {
      const prov = ChunkProvenance.create({
        documentId: 'doc-001',
        documentVersionId: 'ver-001',
        chunkIndex: 0,
        pageNumber: 1,
        sectionHierarchy: ['Protocolo Clínico', 'Higiene'],
        sourceBlockIds: ['blk-1', 'blk-2'],
        language: 'es',
        checksum: validChecksum,
        configurationVersion: 'chunker-v1-target450',
      });

      expect(prov.documentId).toBe('doc-001');
      expect(prov.documentVersionId).toBe('ver-001');
      expect(prov.chunkIndex).toBe(0);
      expect(prov.pageNumber).toBe(1);
      expect(prov.sectionHierarchy).toEqual(['Protocolo Clínico', 'Higiene']);
      expect(prov.sourceBlockIds).toEqual(['blk-1', 'blk-2']);
      expect(prov.language).toBe('es');
      expect(prov.checksum).toBe(validChecksum);
      expect(prov.configurationVersion).toBe('chunker-v1-target450');

      // Test immutability
      expect(() => {
        (prov as { chunkIndex: number }).chunkIndex = 99;
      }).toThrow();
    });

    it('accepts DocumentChecksum VO as checksum input', () => {
      const checksumVO = DocumentChecksum.create(validChecksum);
      const prov = ChunkProvenance.create({
        documentId: 'doc-001',
        documentVersionId: 'ver-001',
        chunkIndex: 1,
        checksum: checksumVO,
        configurationVersion: 'v1',
      });

      expect(prov.checksum).toBe(validChecksum);
    });

    it('rejects missing documentId or documentVersionId', () => {
      expect(() =>
        ChunkProvenance.create({
          documentId: '',
          documentVersionId: 'ver-001',
          chunkIndex: 0,
          checksum: validChecksum,
          configurationVersion: 'v1',
        }),
      ).toThrow(DocumentValidationException);

      expect(() =>
        ChunkProvenance.create({
          documentId: 'doc-001',
          documentVersionId: '   ',
          chunkIndex: 0,
          checksum: validChecksum,
          configurationVersion: 'v1',
        }),
      ).toThrow(DocumentValidationException);
    });

    it('rejects negative chunkIndex', () => {
      expect(() =>
        ChunkProvenance.create({
          documentId: 'doc-001',
          documentVersionId: 'ver-001',
          chunkIndex: -1,
          checksum: validChecksum,
          configurationVersion: 'v1',
        }),
      ).toThrow(DocumentValidationException);
    });

    it('rejects invalid checksum string', () => {
      expect(() =>
        ChunkProvenance.create({
          documentId: 'doc-001',
          documentVersionId: 'ver-001',
          chunkIndex: 0,
          checksum: 'not-a-valid-sha256',
          configurationVersion: 'v1',
        }),
      ).toThrow(DocumentValidationException);
    });
  });
});
