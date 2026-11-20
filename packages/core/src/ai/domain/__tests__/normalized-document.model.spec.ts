import { DocumentFormat } from '../enums/document-format.enum';
import { ExtractedBlockType } from '../enums/extracted-block-type.enum';
import { NormalizedBlock } from '../models/normalized-block.model';
import { NormalizedDocument } from '../models/normalized-document.model';
import { DetectedLanguageResult } from '../value-objects/detected-language.vo';
import { EmptyExtractedDocumentException } from '../exceptions/document-extraction.exceptions';
import { DocumentValidationException } from '../exceptions/knowledge-document.exceptions';

describe('NormalizedDocument (Domain Model)', () => {
  const sampleBlocks = [
    NormalizedBlock.create({
      sourceBlockId: 'src-h1',
      type: ExtractedBlockType.HEADING,
      text: 'Manual de Kinesiología',
      originalLength: 22,
      sequence: 0,
      headingLevel: 1,
      pageNumber: 1,
    }),
    NormalizedBlock.create({
      sourceBlockId: 'src-p1',
      type: ExtractedBlockType.PARAGRAPH,
      text: 'Protocolos de atención kinesiológica integral.',
      originalLength: 46,
      sequence: 1,
      pageNumber: 1,
      sectionPath: ['Manual de Kinesiología'],
    }),
  ];

  it('creates a valid NormalizedDocument with metadata and monotonic sequencing', () => {
    const doc = NormalizedDocument.create({
      documentId: 'doc-norm-1',
      documentVersionId: 'ver-norm-1',
      sourceFormat: DocumentFormat.PDF,
      title: 'Manual de Kinesiología',
      documentLanguage: DetectedLanguageResult.spanish(0.95, 68),
      blocks: sampleBlocks,
    });

    expect(doc.documentId).toBe('doc-norm-1');
    expect(doc.documentVersionId).toBe('ver-norm-1');
    expect(doc.sourceFormat).toBe(DocumentFormat.PDF);
    expect(doc.title).toBe('Manual de Kinesiología');
    expect(doc.blockCount).toBe(2);
    expect(doc.pageCount).toBe(1);
    expect(doc.documentLanguage.language).toBe('es');
    expect(doc.toFullPlainText()).toContain('Manual de Kinesiología');
    expect(doc.toFullPlainText()).toContain('Protocolos de atención');
  });

  it('enforces non-empty document ID and version ID', () => {
    expect(() =>
      NormalizedDocument.create({
        documentId: '',
        documentVersionId: 'ver-1',
        sourceFormat: DocumentFormat.PDF,
        documentLanguage: DetectedLanguageResult.spanish(),
        blocks: sampleBlocks,
      }),
    ).toThrow(DocumentValidationException);

    expect(() =>
      NormalizedDocument.create({
        documentId: 'doc-1',
        documentVersionId: '',
        sourceFormat: DocumentFormat.PDF,
        documentLanguage: DetectedLanguageResult.spanish(),
        blocks: sampleBlocks,
      }),
    ).toThrow(DocumentValidationException);
  });

  it('rejects empty block lists with EmptyExtractedDocumentException', () => {
    expect(() =>
      NormalizedDocument.create({
        documentId: 'doc-empty',
        documentVersionId: 'ver-empty',
        sourceFormat: DocumentFormat.PDF,
        documentLanguage: DetectedLanguageResult.spanish(),
        blocks: [],
      }),
    ).toThrow(EmptyExtractedDocumentException);
  });

  it('rejects blocks that violate strictly monotonic sequencing starting at 0', () => {
    const nonMonotonic = [
      NormalizedBlock.create({
        sourceBlockId: 'src-1',
        type: ExtractedBlockType.PARAGRAPH,
        text: 'Primer bloque',
        originalLength: 13,
        sequence: 0,
      }),
      NormalizedBlock.create({
        sourceBlockId: 'src-2',
        type: ExtractedBlockType.PARAGRAPH,
        text: 'Segundo bloque',
        originalLength: 14,
        sequence: 5, // Gap: should be 1
      }),
    ];

    expect(() =>
      NormalizedDocument.create({
        documentId: 'doc-seq',
        documentVersionId: 'ver-seq',
        sourceFormat: DocumentFormat.MARKDOWN,
        documentLanguage: DetectedLanguageResult.spanish(),
        blocks: nonMonotonic,
      }),
    ).toThrow(DocumentValidationException);
  });
});
