import { ExtractedBlockType } from '../enums/extracted-block-type.enum';
import { NormalizedBlock } from '../models/normalized-block.model';
import { SourceLocation } from '../value-objects/source-location.vo';
import { DetectedLanguageResult } from '../value-objects/detected-language.vo';
import { DocumentValidationException } from '../exceptions/knowledge-document.exceptions';

describe('NormalizedBlock (Domain Model)', () => {
  it('creates a valid NormalizedBlock preserving sourceBlockId and provenance', () => {
    const block = NormalizedBlock.create({
      sourceBlockId: 'src-block-123',
      type: ExtractedBlockType.PARAGRAPH,
      text: 'Tratamiento kinesiológico en fase aguda.',
      originalLength: 45,
      sequence: 0,
      pageNumber: 2,
      location: SourceLocation.create({ pageNumber: 2, startLine: 10, endLine: 12 }),
      sectionPath: ['Rehabilitación', 'Fase 1'],
      detectedLanguage: DetectedLanguageResult.spanish(0.95, 40),
      transformationsApplied: ['UNICODE_NFC', 'COLLAPSE_WHITESPACE'],
    });

    expect(block.id).toBeDefined();
    expect(block.sourceBlockId).toBe('src-block-123');
    expect(block.type).toBe(ExtractedBlockType.PARAGRAPH);
    expect(block.originalLength).toBe(45);
    expect(block.normalizedLength).toBe(40);
    expect(block.charCount).toBe(40);
    expect(block.pageNumber).toBe(2);
    expect(block.sectionPath).toEqual(['Rehabilitación', 'Fase 1']);
    expect(block.detectedLanguage?.language).toBe('es');
    expect(block.transformationsApplied).toEqual(['UNICODE_NFC', 'COLLAPSE_WHITESPACE']);
    expect(block.isHeading()).toBe(false);
  });

  it('enforces headingLevel validation for HEADING blocks', () => {
    expect(() =>
      NormalizedBlock.create({
        sourceBlockId: 'src-h1',
        type: ExtractedBlockType.HEADING,
        text: 'Encabezado inválido',
        originalLength: 20,
        sequence: 0,
        headingLevel: 0, // Invalid: must be 1..6
      }),
    ).toThrow(DocumentValidationException);

    expect(() =>
      NormalizedBlock.create({
        sourceBlockId: 'src-h7',
        type: ExtractedBlockType.HEADING,
        text: 'Encabezado inválido',
        originalLength: 20,
        sequence: 0,
        headingLevel: 7, // Invalid: must be 1..6
      }),
    ).toThrow(DocumentValidationException);
  });

  it('rejects creation without sourceBlockId', () => {
    expect(() =>
      NormalizedBlock.create({
        sourceBlockId: '',
        type: ExtractedBlockType.PARAGRAPH,
        text: 'Texto sin provenance',
        originalLength: 20,
        sequence: 0,
      }),
    ).toThrow(DocumentValidationException);
  });

  it('rejects negative sequence numbers or negative original length', () => {
    expect(() =>
      NormalizedBlock.create({
        sourceBlockId: 'src-1',
        type: ExtractedBlockType.PARAGRAPH,
        text: 'Texto',
        originalLength: 5,
        sequence: -1,
      }),
    ).toThrow(DocumentValidationException);

    expect(() =>
      NormalizedBlock.create({
        sourceBlockId: 'src-1',
        type: ExtractedBlockType.PARAGRAPH,
        text: 'Texto',
        originalLength: -5,
        sequence: 0,
      }),
    ).toThrow(DocumentValidationException);
  });
});
