import { ExtractedBlock } from '../models/extracted-block.model';
import { ExtractedBlockType } from '../enums/extracted-block-type.enum';
import { SourceLocation } from '../value-objects/source-location.vo';
import { DocumentValidationException } from '../exceptions/knowledge-document.exceptions';

describe('ExtractedBlock Domain Model', () => {
  it('creates a valid HEADING block with headingLevel 1-6', () => {
    const heading = ExtractedBlock.create({
      id: 'blk-h1',
      type: ExtractedBlockType.HEADING,
      text: 'Introducción a la Kinesiología',
      sequence: 0,
      headingLevel: 1,
      sectionPath: [],
      pageNumber: 1,
    });

    expect(heading.id).toBe('blk-h1');
    expect(heading.type).toBe(ExtractedBlockType.HEADING);
    expect(heading.text).toBe('Introducción a la Kinesiología');
    expect(heading.headingLevel).toBe(1);
    expect(heading.sequence).toBe(0);
    expect(heading.isHeading()).toBe(true);
    expect(heading.isTable()).toBe(false);
  });

  it('creates a valid PARAGRAPH block without headingLevel', () => {
    const paragraph = ExtractedBlock.create({
      type: ExtractedBlockType.PARAGRAPH,
      text: 'El examen postural evalúa la alineación estática y dinámica del paciente.',
      sequence: 1,
      pageNumber: 1,
      sectionPath: ['Introducción a la Kinesiología'],
    });

    expect(paragraph.id).toBeDefined();
    expect(paragraph.type).toBe(ExtractedBlockType.PARAGRAPH);
    expect(paragraph.headingLevel).toBeNull();
    expect(paragraph.sequence).toBe(1);
    expect(paragraph.charCount).toBe(73);
  });

  it('creates a valid TABLE block with rowCount and colCount metadata', () => {
    const table = ExtractedBlock.create({
      type: ExtractedBlockType.TABLE,
      text: '| Músculo | Origen | Inserción |\n| Biceps | Escápula | Radio |',
      sequence: 2,
      tableMetadata: {
        rowCount: 2,
        colCount: 3,
        headers: ['Músculo', 'Origen', 'Inserción'],
      },
    });

    expect(table.isTable()).toBe(true);
    expect(table.tableMetadata?.rowCount).toBe(2);
    expect(table.tableMetadata?.colCount).toBe(3);
    expect(table.tableMetadata?.headers).toEqual(['Músculo', 'Origen', 'Inserción']);
  });

  it('creates a valid CODE_BLOCK with codeLanguage', () => {
    const code = ExtractedBlock.create({
      type: ExtractedBlockType.CODE_BLOCK,
      text: 'const evaluateAngle = (deg: number) => deg > 90;',
      sequence: 3,
      codeLanguage: 'typescript',
    });

    expect(code.isCode()).toBe(true);
    expect(code.codeLanguage).toBe('typescript');
  });

  it('attaches a SourceLocation VO cleanly', () => {
    const loc = SourceLocation.create({
      pageNumber: 2,
      startOffset: 500,
      endOffset: 650,
      startLine: 20,
      endLine: 25,
    });

    const block = ExtractedBlock.create({
      type: ExtractedBlockType.PARAGRAPH,
      text: 'Texto de prueba con ubicación precisa.',
      sequence: 4,
      location: loc,
    });

    expect(block.location).toBe(loc);
    expect(block.location?.startOffset).toBe(500);
  });

  it('rejects a HEADING block with invalid headingLevel (< 1 or > 6)', () => {
    expect(() =>
      ExtractedBlock.create({
        type: ExtractedBlockType.HEADING,
        text: 'Encabezado Inválido',
        sequence: 0,
        headingLevel: 0,
      }),
    ).toThrow(DocumentValidationException);

    expect(() =>
      ExtractedBlock.create({
        type: ExtractedBlockType.HEADING,
        text: 'Encabezado Inválido',
        sequence: 0,
        headingLevel: 7,
      }),
    ).toThrow(DocumentValidationException);

    expect(() =>
      ExtractedBlock.create({
        type: ExtractedBlockType.HEADING,
        text: 'Encabezado Sin Nivel',
        sequence: 0,
      }),
    ).toThrow(DocumentValidationException);
  });

  it('rejects a non-HEADING block that specifies a headingLevel', () => {
    expect(() =>
      ExtractedBlock.create({
        type: ExtractedBlockType.PARAGRAPH,
        text: 'Párrafo con nivel no permitido',
        sequence: 0,
        headingLevel: 2,
      }),
    ).toThrow(DocumentValidationException);
  });

  it('rejects negative sequence numbers', () => {
    expect(() =>
      ExtractedBlock.create({
        type: ExtractedBlockType.PARAGRAPH,
        text: 'Secuencia negativa',
        sequence: -1,
      }),
    ).toThrow(DocumentValidationException);
  });

  it('rejects invalid page number (< 1)', () => {
    expect(() =>
      ExtractedBlock.create({
        type: ExtractedBlockType.PARAGRAPH,
        text: 'Página inválida',
        sequence: 0,
        pageNumber: 0,
      }),
    ).toThrow(DocumentValidationException);
  });

  it('ensures ExtractedBlock instances are deeply immutable', () => {
    const block = ExtractedBlock.create({
      type: ExtractedBlockType.PARAGRAPH,
      text: 'Contenido inmutable',
      sequence: 0,
      sectionPath: ['Sección 1'],
    });

    expect(() => {
      (block as { text: string }).text = 'Modificado';
    }).toThrow();

    expect(() => {
      (block.sectionPath as string[]).push('Sección Hack');
    }).toThrow();
  });
});
