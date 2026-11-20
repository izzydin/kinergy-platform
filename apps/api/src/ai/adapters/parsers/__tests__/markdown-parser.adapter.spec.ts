import {
  DocumentFormat,
  ExtractedBlockType,
  InvalidFormatExtractionException,
  EmptyExtractedDocumentException,
  ExtractionResourceLimitExceededException,
} from '@kinergy-platform/core';
import { MarkdownParserAdapter } from '../markdown-parser.adapter';
import { SAMPLE_MARKDOWN } from './parser-fixtures';

describe('MarkdownParserAdapter (Unit & Security)', () => {
  let adapter: MarkdownParserAdapter;

  beforeEach(() => {
    adapter = new MarkdownParserAdapter();
  });

  describe('Format Support & Preflight Validation', () => {
    it('declares support strictly for DocumentFormat.MARKDOWN', () => {
      expect(adapter.supportsFormat(DocumentFormat.MARKDOWN)).toBe(true);
      expect(adapter.supportsFormat(DocumentFormat.PDF)).toBe(false);
      expect(adapter.supportsFormat(DocumentFormat.DOCX)).toBe(false);
      expect(adapter.supportsFormat(DocumentFormat.TXT)).toBe(false);
    });

    it('validates a valid UTF-8 markdown buffer successfully', async () => {
      const buffer = Buffer.from(SAMPLE_MARKDOWN, 'utf8');
      const result = await adapter.validateCompatibility(buffer, DocumentFormat.MARKDOWN);

      expect(result.isCompatible).toBe(true);
      expect(result.format).toBe(DocumentFormat.MARKDOWN);
    });

    it('rejects binary content disguised as markdown during validation', async () => {
      const binaryBuffer = Buffer.from([0x00, 0x01, 0x02, 0x00, 0xff]);
      const result = await adapter.validateCompatibility(binaryBuffer, DocumentFormat.MARKDOWN);

      expect(result.isCompatible).toBe(false);
      expect(result.rejectionReason).toMatch(/binary/i);
    });

    it('rejects markdown buffers exceeding maximum size limit', async () => {
      const smallAdapter = new MarkdownParserAdapter({ maxSizeBytes: 50 });
      const buffer = Buffer.from(SAMPLE_MARKDOWN, 'utf8');
      const result = await smallAdapter.validateCompatibility(buffer, DocumentFormat.MARKDOWN);

      expect(result.isCompatible).toBe(false);
      expect(result.rejectionReason).toContain('exceeds limit');
    });
  });

  describe('Extraction & Structure Preservation', () => {
    it('extracts sample markdown preserving headings, sections, tables, code blocks and lists', async () => {
      const buffer = Buffer.from(SAMPLE_MARKDOWN, 'utf8');

      const doc = await adapter.parse({
        tenantId: 'tenant-1',
        documentId: 'doc-md-1',
        documentVersionId: 'ver-md-1',
        format: DocumentFormat.MARKDOWN,
        buffer,
        originalFileName: 'protocolo.md',
      });

      expect(doc.documentId).toBe('doc-md-1');
      expect(doc.documentVersionId).toBe('ver-md-1');
      expect(doc.sourceFormat).toBe(DocumentFormat.MARKDOWN);
      expect(doc.pageCount).toBe(0);
      expect(doc.metadata.pageCount).toBeNull();
      expect(doc.title).toBe('Protocolo de Atención Kine-Deportiva');

      // Headings
      const headings = doc.getBlocksByType(ExtractedBlockType.HEADING);
      expect(headings.length).toBeGreaterThanOrEqual(4);
      expect(headings[0]?.headingLevel).toBe(1);
      expect(headings[0]?.text).toBe('Protocolo de Atención Kine-Deportiva');
      expect(headings[1]?.headingLevel).toBe(2);
      expect(headings[1]?.text).toBe('1. Criterios de Ingreso');
      expect(headings[1]?.sectionPath).toEqual(['Protocolo de Atención Kine-Deportiva']);

      // List Items
      const listItems = doc.getBlocksByType(ExtractedBlockType.LIST_ITEM);
      expect(listItems.length).toBeGreaterThanOrEqual(2);
      expect(listItems[0]?.text).toContain('Dolor localizado sin rotura completa');
      expect(listItems[1]?.text).toContain('Rango de movimiento superior al 70%');

      // Table
      const tables = doc.getBlocksByType(ExtractedBlockType.TABLE);
      expect(tables.length).toBe(1);
      expect(tables[0]?.tableMetadata).toBeDefined();
      expect(tables[0]?.tableMetadata?.rowCount).toBe(3); // header + 2 data rows
      expect(tables[0]?.tableMetadata?.colCount).toBe(3);
      expect(tables[0]?.text).toContain('Grupo Muscular');
      expect(tables[0]?.text).toContain('Cuádriceps');

      // Code Block
      const codeBlocks = doc.getBlocksByType(ExtractedBlockType.CODE_BLOCK);
      expect(codeBlocks.length).toBe(1);
      expect(codeBlocks[0]?.codeLanguage).toBe('typescript');
      expect(codeBlocks[0]?.text).toContain('isReadyForReturn');

      // Blockquote
      const quotes = doc.getBlocksByType(ExtractedBlockType.BLOCKQUOTE);
      expect(quotes.length).toBe(1);
      expect(quotes[0]?.text).toContain('La progresión funcional requiere alta');

      // All blocks must have null pageNumber
      for (const block of doc.blocks) {
        expect(block.pageNumber).toBeNull();
      }
    });

    it('correctly handles UTF-8 BOM encoding', async () => {
      const bom = Buffer.from([0xef, 0xbb, 0xbf]);
      const content = Buffer.from('# Título con BOM\n\nPárrafo de prueba.', 'utf8');
      const buffer = Buffer.concat([bom, content]);

      const doc = await adapter.parse({
        tenantId: 'tenant-1',
        documentId: 'doc-md-bom',
        documentVersionId: 'ver-md-bom',
        format: DocumentFormat.MARKDOWN,
        buffer,
      });

      expect(doc.title).toBe('Título con BOM');
      const paragraphs = doc.getBlocksByType(ExtractedBlockType.PARAGRAPH);
      expect(paragraphs[0]?.text).toBe('Párrafo de prueba.');
    });
  });

  describe('Security & Failure Classification', () => {
    it('rejects empty markdown files with EmptyExtractedDocumentException', async () => {
      const emptyBuffer = Buffer.from('   \n\t  \n  ');

      await expect(
        adapter.parse({
          tenantId: 'tenant-1',
          documentId: 'doc-md-empty',
          documentVersionId: 'ver-md-empty',
          format: DocumentFormat.MARKDOWN,
          buffer: emptyBuffer,
        }),
      ).rejects.toThrow(EmptyExtractedDocumentException);
    });

    it('rejects binary files disguised as markdown with InvalidFormatExtractionException', async () => {
      const binaryBuffer = Buffer.from('# Header\n\x00\x01\x02\x03Some binary content');

      await expect(
        adapter.parse({
          tenantId: 'tenant-1',
          documentId: 'doc-md-bin',
          documentVersionId: 'ver-md-bin',
          format: DocumentFormat.MARKDOWN,
          buffer: binaryBuffer,
        }),
      ).rejects.toThrow(InvalidFormatExtractionException);
    });

    it('enforces maximum file size limit with ExtractionResourceLimitExceededException', async () => {
      const smallAdapter = new MarkdownParserAdapter({ maxSizeBytes: 20 });
      const buffer = Buffer.from(
        '# Extremely long markdown document content exceeding limit',
        'utf8',
      );

      await expect(
        smallAdapter.parse({
          tenantId: 'tenant-1',
          documentId: 'doc-md-big',
          documentVersionId: 'ver-md-big',
          format: DocumentFormat.MARKDOWN,
          buffer,
        }),
      ).rejects.toThrow(ExtractionResourceLimitExceededException);
    });

    it('strips script execution and dangerous HTML tags', async () => {
      const maliciousMd = `# Documento Seguro\n\n<script>alert("xss")</script>\n<p>Párrafo legítimo</p>`;
      const buffer = Buffer.from(maliciousMd, 'utf8');

      const doc = await adapter.parse({
        tenantId: 'tenant-1',
        documentId: 'doc-md-xss',
        documentVersionId: 'ver-md-xss',
        format: DocumentFormat.MARKDOWN,
        buffer,
      });

      const fullText = doc.toFullPlainText();
      expect(fullText).not.toContain('<script>');
      expect(fullText).toContain('Párrafo legítimo');
    });
  });
});
