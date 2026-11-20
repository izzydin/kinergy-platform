import {
  DocumentFormat,
  ExtractedBlockType,
  InvalidFormatExtractionException,
  EmptyExtractedDocumentException,
  ExtractionResourceLimitExceededException,
} from '@kinergy-platform/core';
import { PlainTextParserAdapter } from '../plain-text-parser.adapter';
import { SAMPLE_SPANISH_TXT } from './parser-fixtures';

describe('PlainTextParserAdapter (Unit & Security)', () => {
  let adapter: PlainTextParserAdapter;

  beforeEach(() => {
    adapter = new PlainTextParserAdapter();
  });

  describe('Format Support & Preflight Validation', () => {
    it('declares support strictly for DocumentFormat.TXT', () => {
      expect(adapter.supportsFormat(DocumentFormat.TXT)).toBe(true);
      expect(adapter.supportsFormat(DocumentFormat.PDF)).toBe(false);
      expect(adapter.supportsFormat(DocumentFormat.DOCX)).toBe(false);
      expect(adapter.supportsFormat(DocumentFormat.MARKDOWN)).toBe(false);
    });

    it('validates a valid UTF-8 text buffer successfully', async () => {
      const buffer = Buffer.from(SAMPLE_SPANISH_TXT, 'utf8');
      const result = await adapter.validateCompatibility(buffer, DocumentFormat.TXT);

      expect(result.isCompatible).toBe(true);
      expect(result.format).toBe(DocumentFormat.TXT);
    });

    it('rejects binary content disguised as plain text during validation', async () => {
      const binaryBuffer = Buffer.from([0x00, 0x01, 0x02, 0x00, 0xff]);
      const result = await adapter.validateCompatibility(binaryBuffer, DocumentFormat.TXT);

      expect(result.isCompatible).toBe(false);
      expect(result.rejectionReason).toMatch(/binary/i);
    });

    it('rejects text buffers exceeding maximum size limit', async () => {
      const smallAdapter = new PlainTextParserAdapter({ maxSizeBytes: 30 });
      const buffer = Buffer.from(SAMPLE_SPANISH_TXT, 'utf8');
      const result = await smallAdapter.validateCompatibility(buffer, DocumentFormat.TXT);

      expect(result.isCompatible).toBe(false);
      expect(result.rejectionReason).toContain('exceeds limit');
    });
  });

  describe('Extraction & Structure Preservation', () => {
    it('extracts Spanish text with accents and paragraph line-range provenance', async () => {
      const buffer = Buffer.from(SAMPLE_SPANISH_TXT, 'utf8');

      const doc = await adapter.parse({
        tenantId: 'tenant-1',
        documentId: 'doc-txt-1',
        documentVersionId: 'ver-txt-1',
        format: DocumentFormat.TXT,
        buffer,
        originalFileName: 'procedimientos_clinicos.txt',
      });

      expect(doc.documentId).toBe('doc-txt-1');
      expect(doc.documentVersionId).toBe('ver-txt-1');
      expect(doc.sourceFormat).toBe(DocumentFormat.TXT);
      expect(doc.pageCount).toBe(0);
      expect(doc.metadata.pageCount).toBeNull();
      expect(doc.title).toBe('MANUAL DE PROCEDIMIENTOS CLÍNICOS');

      // Verify Spanish accents preservation
      const fullText = doc.toFullPlainText();
      expect(fullText).toContain('fisioterapéutica');
      expect(fullText).toContain('lumbalgia mecánica');
      expect(fullText).toContain('estática pélvica');
      expect(fullText).toContain('kinesiólogo');

      // Verify discrete paragraph blocks with accurate line ranges
      const paragraphs = doc.getBlocksByType(ExtractedBlockType.PARAGRAPH);
      expect(paragraphs.length).toBeGreaterThanOrEqual(4);

      // Block 0: Title paragraph
      expect(paragraphs[0]?.text).toBe('MANUAL DE PROCEDIMIENTOS CLÍNICOS');
      expect(paragraphs[0]?.location?.startLine).toBe(1);
      expect(paragraphs[0]?.location?.endLine).toBe(1);
      expect(paragraphs[0]?.pageNumber).toBeNull();

      // Block 1: Body paragraph
      expect(paragraphs[1]?.text).toContain('El presente instructivo establece las pautas');
      expect(paragraphs[1]?.location?.startLine).toBe(3);
      expect(paragraphs[1]?.location?.endLine).toBe(3);

      // Invariant: Unpaginated formats must never fabricate page numbers
      for (const block of doc.blocks) {
        expect(block.pageNumber).toBeNull();
      }
    });

    it('correctly handles UTF-8 BOM encoding', async () => {
      const bom = Buffer.from([0xef, 0xbb, 0xbf]);
      const content = Buffer.from('Protocolo con BOM UTF-8\n\nContenido verificado.', 'utf8');
      const buffer = Buffer.concat([bom, content]);

      const doc = await adapter.parse({
        tenantId: 'tenant-1',
        documentId: 'doc-txt-bom',
        documentVersionId: 'ver-txt-bom',
        format: DocumentFormat.TXT,
        buffer,
      });

      expect(doc.title).toBe('Protocolo con BOM UTF-8');
      expect(doc.blocks[0]?.text).toBe('Protocolo con BOM UTF-8');
    });

    it('gracefully handles ISO-8859-1 (Latin-1) encoded documents', async () => {
      // Create Latin1 buffer containing characters that are invalid UTF-8 sequences
      const latin1Text = 'Evaluación kinésica: dolor agudo en región lumbar.';
      const buffer = Buffer.from(latin1Text, 'latin1');

      const doc = await adapter.parse({
        tenantId: 'tenant-1',
        documentId: 'doc-txt-latin1',
        documentVersionId: 'ver-txt-latin1',
        format: DocumentFormat.TXT,
        buffer,
      });

      expect(doc.blocks.length).toBeGreaterThanOrEqual(1);
      expect(doc.metadata.custom?.encoding).toBeDefined();
    });
  });

  describe('Security & Failure Classification', () => {
    it('rejects empty text files with EmptyExtractedDocumentException', async () => {
      const emptyBuffer = Buffer.from('   \n\r\n \t \n  ');

      await expect(
        adapter.parse({
          tenantId: 'tenant-1',
          documentId: 'doc-txt-empty',
          documentVersionId: 'ver-txt-empty',
          format: DocumentFormat.TXT,
          buffer: emptyBuffer,
        }),
      ).rejects.toThrow(EmptyExtractedDocumentException);
    });

    it('rejects binary files disguised as text with InvalidFormatExtractionException', async () => {
      const binaryBuffer = Buffer.from('Text start\x00\x00\x01\x02binary suffix');

      await expect(
        adapter.parse({
          tenantId: 'tenant-1',
          documentId: 'doc-txt-bin',
          documentVersionId: 'ver-txt-bin',
          format: DocumentFormat.TXT,
          buffer: binaryBuffer,
        }),
      ).rejects.toThrow(InvalidFormatExtractionException);
    });

    it('enforces maximum file size limit with ExtractionResourceLimitExceededException', async () => {
      const smallAdapter = new PlainTextParserAdapter({ maxSizeBytes: 20 });
      const buffer = Buffer.from('Extremely long text content exceeding buffer limit', 'utf8');

      await expect(
        smallAdapter.parse({
          tenantId: 'tenant-1',
          documentId: 'doc-txt-big',
          documentVersionId: 'ver-txt-big',
          format: DocumentFormat.TXT,
          buffer,
        }),
      ).rejects.toThrow(ExtractionResourceLimitExceededException);
    });
  });
});
