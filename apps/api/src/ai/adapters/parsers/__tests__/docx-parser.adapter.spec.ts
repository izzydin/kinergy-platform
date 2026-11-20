import {
  DocumentFormat,
  ExtractedBlockType,
  InvalidFormatExtractionException,
  CorruptDocumentExtractionException,
  EmptyExtractedDocumentException,
  UnsupportedDocumentFeatureException,
  ExtractionResourceLimitExceededException,
} from '@kinergy-platform/core';
import { DocxParserAdapter } from '../docx-parser.adapter';
import {
  createValidDocx,
  createDocxWithTable,
  createDocxWithLists,
  createEmptyDocx,
  createCorruptDocx,
  createMacroDocx,
  createZipBombDocx,
} from './parser-fixtures';

describe('DocxParserAdapter (Unit & Security)', () => {
  let adapter: DocxParserAdapter;

  beforeEach(() => {
    adapter = new DocxParserAdapter();
  });

  describe('Format Support & Preflight Validation', () => {
    it('declares support strictly for DocumentFormat.DOCX', () => {
      expect(adapter.supportsFormat(DocumentFormat.DOCX)).toBe(true);
      expect(adapter.supportsFormat(DocumentFormat.PDF)).toBe(false);
      expect(adapter.supportsFormat(DocumentFormat.MARKDOWN)).toBe(false);
      expect(adapter.supportsFormat(DocumentFormat.TXT)).toBe(false);
    });

    it('validates a valid DOCX buffer successfully', async () => {
      const docxBuffer = createValidDocx();
      const result = await adapter.validateCompatibility(docxBuffer, DocumentFormat.DOCX);

      expect(result.isCompatible).toBe(true);
      expect(result.format).toBe(DocumentFormat.DOCX);
    });

    it('rejects non-ZIP buffers during compatibility validation', async () => {
      const invalidBuffer = Buffer.from('This is not a zip archive');
      const result = await adapter.validateCompatibility(invalidBuffer, DocumentFormat.DOCX);

      expect(result.isCompatible).toBe(false);
      expect(result.rejectionReason).toContain('ZIP');
    });

    it('rejects DOCX files exceeding maximum size limit', async () => {
      const smallAdapter = new DocxParserAdapter({ maxSizeBytes: 100 });
      const docxBuffer = createValidDocx();
      const result = await smallAdapter.validateCompatibility(docxBuffer, DocumentFormat.DOCX);

      expect(result.isCompatible).toBe(false);
      expect(result.rejectionReason).toContain('exceeds limit');
    });

    it('rejects DOCX files containing VBA macros during validation', async () => {
      const macroDocx = createMacroDocx();
      const result = await adapter.validateCompatibility(macroDocx, DocumentFormat.DOCX);

      expect(result.isCompatible).toBe(false);
      expect(result.unsupportedFeatures).toContain('VBA_MACROS');
    });
  });

  describe('Extraction & Structure Preservation', () => {
    it('extracts headings and paragraphs preserving section hierarchy', async () => {
      const docxBuffer = createValidDocx();

      const doc = await adapter.parse({
        tenantId: 'tenant-1',
        documentId: 'doc-docx-1',
        documentVersionId: 'ver-docx-1',
        format: DocumentFormat.DOCX,
        buffer: docxBuffer,
        originalFileName: 'guia_clinica.docx',
      });

      expect(doc.documentId).toBe('doc-docx-1');
      expect(doc.documentVersionId).toBe('ver-docx-1');
      expect(doc.sourceFormat).toBe(DocumentFormat.DOCX);
      expect(doc.pageCount).toBe(0);
      expect(doc.metadata.pageCount).toBeNull();
      expect(doc.title).toBe('Manual de Kinesiología y Fisioterapia');

      // Verify headings
      const headings = doc.getBlocksByType(ExtractedBlockType.HEADING);
      expect(headings.length).toBeGreaterThanOrEqual(2);
      expect(headings[0]?.headingLevel).toBe(1);
      expect(headings[0]?.text).toBe('Manual de Kinesiología y Fisioterapia');
      expect(headings[1]?.headingLevel).toBe(2);
      expect(headings[1]?.text).toBe('1. Evaluación Inicial');
      expect(headings[1]?.sectionPath).toEqual(['Manual de Kinesiología y Fisioterapia']);

      // Verify paragraph block
      const paragraphs = doc.getBlocksByType(ExtractedBlockType.PARAGRAPH);
      expect(paragraphs.length).toBeGreaterThanOrEqual(1);
      expect(paragraphs[0]?.text).toContain('protocolos clínicos');
      expect(paragraphs[0]?.pageNumber).toBeNull();
    });

    it('extracts tables preserving row and cell structure', async () => {
      const tableDocx = createDocxWithTable();

      const doc = await adapter.parse({
        tenantId: 'tenant-1',
        documentId: 'doc-docx-table',
        documentVersionId: 'ver-docx-table',
        format: DocumentFormat.DOCX,
        buffer: tableDocx,
        originalFileName: 'dosificacion.docx',
      });

      const tables = doc.getBlocksByType(ExtractedBlockType.TABLE);
      expect(tables.length).toBe(1);

      const tableBlock = tables[0];
      expect(tableBlock).toBeDefined();
      expect(tableBlock?.tableMetadata).toBeDefined();
      expect(tableBlock?.tableMetadata?.rowCount).toBe(3);
      expect(tableBlock?.tableMetadata?.colCount).toBe(2);
      expect(tableBlock?.text).toContain('Tratamiento');
      expect(tableBlock?.text).toContain('Electroterapia');
      expect(tableBlock?.text).toContain('Cinesiterapia');
    });

    it('extracts lists preserving item structure', async () => {
      const listDocx = createDocxWithLists();

      const doc = await adapter.parse({
        tenantId: 'tenant-1',
        documentId: 'doc-docx-list',
        documentVersionId: 'ver-docx-list',
        format: DocumentFormat.DOCX,
        buffer: listDocx,
        originalFileName: 'criterios.docx',
      });

      const listItems = doc.getBlocksByType(ExtractedBlockType.LIST_ITEM);
      expect(listItems.length).toBe(3);
      expect(listItems[0]?.text).toContain('Camilla hidráulica regulable');
      expect(listItems[1]?.text).toContain('Equipo TENS de 4 canales');
      expect(listItems[2]?.text).toContain('Bandas de resistencia elástica');
    });
  });

  describe('Security & Failure Classification', () => {
    it('rejects corrupted DOCX files missing [Content_Types].xml', async () => {
      const corruptDocx = createCorruptDocx();

      await expect(
        adapter.parse({
          tenantId: 'tenant-1',
          documentId: 'doc-docx-corrupt',
          documentVersionId: 'ver-docx-corrupt',
          format: DocumentFormat.DOCX,
          buffer: corruptDocx,
        }),
      ).rejects.toThrow(CorruptDocumentExtractionException);
    });

    it('rejects macro-enabled documents with UnsupportedDocumentFeatureException', async () => {
      const macroDocx = createMacroDocx();

      await expect(
        adapter.parse({
          tenantId: 'tenant-1',
          documentId: 'doc-docx-macro',
          documentVersionId: 'ver-docx-macro',
          format: DocumentFormat.DOCX,
          buffer: macroDocx,
        }),
      ).rejects.toThrow(UnsupportedDocumentFeatureException);
    });

    it('rejects zip bomb / decompression ratio anomaly with ExtractionResourceLimitExceededException', async () => {
      const zipBomb = createZipBombDocx();

      await expect(
        adapter.parse({
          tenantId: 'tenant-1',
          documentId: 'doc-docx-bomb',
          documentVersionId: 'ver-docx-bomb',
          format: DocumentFormat.DOCX,
          buffer: zipBomb,
        }),
      ).rejects.toThrow(ExtractionResourceLimitExceededException);
    });

    it('rejects completely empty DOCX files with EmptyExtractedDocumentException', async () => {
      const emptyDocx = createEmptyDocx();

      await expect(
        adapter.parse({
          tenantId: 'tenant-1',
          documentId: 'doc-docx-empty',
          documentVersionId: 'ver-docx-empty',
          format: DocumentFormat.DOCX,
          buffer: emptyDocx,
        }),
      ).rejects.toThrow(EmptyExtractedDocumentException);
    });

    it('rejects non-zip buffers with InvalidFormatExtractionException', async () => {
      const textBuffer = Buffer.from('Not a zip file at all');

      await expect(
        adapter.parse({
          tenantId: 'tenant-1',
          documentId: 'doc-docx-invalid',
          documentVersionId: 'ver-docx-invalid',
          format: DocumentFormat.DOCX,
          buffer: textBuffer,
        }),
      ).rejects.toThrow(InvalidFormatExtractionException);
    });
  });
});
