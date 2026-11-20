import { ExtractedDocument } from '../models/extracted-document.model';
import { ExtractedBlock } from '../models/extracted-block.model';
import { ExtractedBlockType } from '../enums/extracted-block-type.enum';
import { DocumentFormat } from '../enums/document-format.enum';
import { DocumentValidationException } from '../exceptions/knowledge-document.exceptions';
import { EmptyExtractedDocumentException } from '../exceptions/document-extraction.exceptions';

describe('ExtractedDocument Domain Aggregate', () => {
  const validBlocks = [
    ExtractedBlock.create({
      id: 'blk-1',
      type: ExtractedBlockType.HEADING,
      text: 'Manual de Procedimientos Clínicos',
      sequence: 0,
      headingLevel: 1,
      pageNumber: 1,
    }),
    ExtractedBlock.create({
      id: 'blk-2',
      type: ExtractedBlockType.PARAGRAPH,
      text: 'Todos los profesionales deben seguir los protocolos de higiene antes de atender.',
      sequence: 1,
      sectionPath: ['Manual de Procedimientos Clínicos'],
      pageNumber: 1,
    }),
    ExtractedBlock.create({
      id: 'blk-3',
      type: ExtractedBlockType.HEADING,
      text: '1. Desinfección de Camilla',
      sequence: 2,
      headingLevel: 2,
      sectionPath: ['Manual de Procedimientos Clínicos'],
      pageNumber: 2,
    }),
    ExtractedBlock.create({
      id: 'blk-4',
      type: ExtractedBlockType.PARAGRAPH,
      text: 'Utilizar alcohol al 70% o solución desinfectante aprobada tras cada sesión.',
      sequence: 3,
      sectionPath: ['Manual de Procedimientos Clínicos', '1. Desinfección de Camilla'],
      pageNumber: 2,
    }),
  ];

  it('creates a valid ExtractedDocument for PDF with page counts and headings', () => {
    const doc = ExtractedDocument.create({
      documentId: 'doc-100',
      documentVersionId: 'ver-100',
      sourceFormat: DocumentFormat.PDF,
      title: 'Manual de Procedimientos',
      languageHint: 'es',
      blocks: validBlocks,
      metadata: {
        parserName: 'unpdf-adapter',
        parserVersion: '1.0.0',
        pageCount: 2,
      },
    });

    expect(doc.documentId).toBe('doc-100');
    expect(doc.documentVersionId).toBe('ver-100');
    expect(doc.sourceFormat).toBe(DocumentFormat.PDF);
    expect(doc.title).toBe('Manual de Procedimientos');
    expect(doc.languageHint).toBe('es');
    expect(doc.blockCount).toBe(4);
    expect(doc.pageCount).toBe(2);
    expect(doc.totalCharacters).toBeGreaterThan(100);

    const headings = doc.getHeadingBlocks();
    expect(headings.length).toBe(2);
    expect(headings[0]?.text).toBe('Manual de Procedimientos Clínicos');
    expect(headings[1]?.text).toBe('1. Desinfección de Camilla');

    const page2Blocks = doc.getBlocksForPage(2);
    expect(page2Blocks.length).toBe(2);

    expect(doc.toFullPlainText()).toContain('alcohol al 70%');
  });

  it('creates a valid ExtractedDocument for Markdown with null page numbers', () => {
    const mdBlocks = [
      ExtractedBlock.create({
        type: ExtractedBlockType.HEADING,
        text: 'Guía Rápida de Ejercicios',
        sequence: 0,
        headingLevel: 1,
        pageNumber: null,
      }),
      ExtractedBlock.create({
        type: ExtractedBlockType.PARAGRAPH,
        text: 'Ejecutar series de 10 repeticiones con descanso de 60 segundos.',
        sequence: 1,
        pageNumber: null,
      }),
    ];

    const doc = ExtractedDocument.create({
      documentId: 'doc-md',
      documentVersionId: 'ver-md',
      sourceFormat: DocumentFormat.MARKDOWN,
      blocks: mdBlocks,
    });

    expect(doc.sourceFormat).toBe(DocumentFormat.MARKDOWN);
    expect(doc.pageCount).toBe(0); // Unpaginated
    expect(doc.blockCount).toBe(2);
  });

  it('rejects fabricated page numbers for unpaginated format (Markdown / TXT)', () => {
    const fabricatedBlocks = [
      ExtractedBlock.create({
        type: ExtractedBlockType.PARAGRAPH,
        text: 'Contenido con página falsa',
        sequence: 0,
        pageNumber: 1, // Fabricated page on Markdown!
      }),
    ];

    expect(() =>
      ExtractedDocument.create({
        documentId: 'doc-md',
        documentVersionId: 'ver-md',
        sourceFormat: DocumentFormat.MARKDOWN,
        blocks: fabricatedBlocks,
      }),
    ).toThrow(DocumentValidationException);

    expect(() =>
      ExtractedDocument.create({
        documentId: 'doc-txt',
        documentVersionId: 'ver-txt',
        sourceFormat: DocumentFormat.TXT,
        blocks: fabricatedBlocks,
      }),
    ).toThrow(DocumentValidationException);
  });

  it('rejects empty blocks array with EmptyExtractedDocumentException', () => {
    expect(() =>
      ExtractedDocument.create({
        documentId: 'doc-empty',
        documentVersionId: 'ver-empty',
        sourceFormat: DocumentFormat.PDF,
        blocks: [],
      }),
    ).toThrow(EmptyExtractedDocumentException);
  });

  it('rejects blocks containing only whitespace with EmptyExtractedDocumentException', () => {
    const whitespaceBlocks = [
      ExtractedBlock.create({
        type: ExtractedBlockType.PARAGRAPH,
        text: '   \n\t  ',
        sequence: 0,
        pageNumber: 1,
      }),
    ];

    expect(() =>
      ExtractedDocument.create({
        documentId: 'doc-ws',
        documentVersionId: 'ver-ws',
        sourceFormat: DocumentFormat.PDF,
        blocks: whitespaceBlocks,
      }),
    ).toThrow(EmptyExtractedDocumentException);
  });

  it('enforces strictly increasing block sequence order', () => {
    const outOfOrderBlocks = [
      ExtractedBlock.create({
        type: ExtractedBlockType.PARAGRAPH,
        text: 'Primer párrafo',
        sequence: 2,
        pageNumber: 1,
      }),
      ExtractedBlock.create({
        type: ExtractedBlockType.PARAGRAPH,
        text: 'Segundo párrafo desordenado',
        sequence: 1, // Invalid: 1 <= 2!
        pageNumber: 1,
      }),
    ];

    expect(() =>
      ExtractedDocument.create({
        documentId: 'doc-seq',
        documentVersionId: 'ver-seq',
        sourceFormat: DocumentFormat.PDF,
        blocks: outOfOrderBlocks,
      }),
    ).toThrow(DocumentValidationException);
  });

  it('enforces non-empty documentId and documentVersionId', () => {
    expect(() =>
      ExtractedDocument.create({
        documentId: '',
        documentVersionId: 'ver-1',
        sourceFormat: DocumentFormat.PDF,
        blocks: validBlocks,
      }),
    ).toThrow(DocumentValidationException);

    expect(() =>
      ExtractedDocument.create({
        documentId: 'doc-1',
        documentVersionId: '   ',
        sourceFormat: DocumentFormat.PDF,
        blocks: validBlocks,
      }),
    ).toThrow(DocumentValidationException);
  });

  it('ensures ExtractedDocument is deeply frozen and immutable', () => {
    const doc = ExtractedDocument.create({
      documentId: 'doc-imm',
      documentVersionId: 'ver-imm',
      sourceFormat: DocumentFormat.PDF,
      blocks: validBlocks,
    });

    expect(() => {
      (doc as { title: string }).title = 'Hacked Title';
    }).toThrow();

    expect(() => {
      (doc.blocks as ExtractedBlock[]).push(
        ExtractedBlock.create({
          type: ExtractedBlockType.PARAGRAPH,
          text: 'Párrafo no autorizado',
          sequence: 99,
          pageNumber: 1,
        }),
      );
    }).toThrow();
  });
});
