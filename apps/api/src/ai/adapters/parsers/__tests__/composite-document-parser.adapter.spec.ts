import { DocumentFormat, UnsupportedFormatExtractionException } from '@kinergy-platform/core';
import { CompositeDocumentParserAdapter } from '../composite-document-parser.adapter';
import { PdfParserAdapter } from '../pdf-parser.adapter';
import { DocxParserAdapter } from '../docx-parser.adapter';
import { MarkdownParserAdapter } from '../markdown-parser.adapter';
import { PlainTextParserAdapter } from '../plain-text-parser.adapter';
import {
  createSinglePagePdf,
  createValidDocx,
  SAMPLE_MARKDOWN,
  SAMPLE_SPANISH_TXT,
} from './parser-fixtures';

describe('CompositeDocumentParserAdapter (Unit & Routing)', () => {
  let composite: CompositeDocumentParserAdapter;
  let pdfParser: PdfParserAdapter;
  let docxParser: DocxParserAdapter;
  let mdParser: MarkdownParserAdapter;
  let txtParser: PlainTextParserAdapter;

  beforeEach(() => {
    pdfParser = new PdfParserAdapter();
    docxParser = new DocxParserAdapter();
    mdParser = new MarkdownParserAdapter();
    txtParser = new PlainTextParserAdapter();

    composite = new CompositeDocumentParserAdapter(pdfParser, docxParser, mdParser, txtParser);
  });

  describe('Format Support & Discovery', () => {
    it('supports PDF, DOCX, MARKDOWN, and TXT', () => {
      expect(composite.supportsFormat(DocumentFormat.PDF)).toBe(true);
      expect(composite.supportsFormat(DocumentFormat.DOCX)).toBe(true);
      expect(composite.supportsFormat(DocumentFormat.MARKDOWN)).toBe(true);
      expect(composite.supportsFormat(DocumentFormat.TXT)).toBe(true);
    });

    it('rejects unsupported formats in supportsFormat', () => {
      expect(composite.supportsFormat('UNKNOWN_FORMAT' as DocumentFormat)).toBe(false);
    });

    it('exposes all supported formats via getSupportedFormats', () => {
      const formats = composite.getSupportedFormats();
      expect(formats).toContain(DocumentFormat.PDF);
      expect(formats).toContain(DocumentFormat.DOCX);
      expect(formats).toContain(DocumentFormat.MARKDOWN);
      expect(formats).toContain(DocumentFormat.TXT);
      expect(formats.length).toBe(4);
    });
  });

  describe('Preflight Validation Routing', () => {
    it('routes PDF validation to PdfParserAdapter', async () => {
      const pdfBuffer = createSinglePagePdf('Test PDF');
      const result = await composite.validateCompatibility(pdfBuffer, DocumentFormat.PDF);

      expect(result.isCompatible).toBe(true);
      expect(result.format).toBe(DocumentFormat.PDF);
    });

    it('routes DOCX validation to DocxParserAdapter', async () => {
      const docxBuffer = createValidDocx();
      const result = await composite.validateCompatibility(docxBuffer, DocumentFormat.DOCX);

      expect(result.isCompatible).toBe(true);
      expect(result.format).toBe(DocumentFormat.DOCX);
    });

    it('routes Markdown validation to MarkdownParserAdapter', async () => {
      const mdBuffer = Buffer.from(SAMPLE_MARKDOWN, 'utf8');
      const result = await composite.validateCompatibility(mdBuffer, DocumentFormat.MARKDOWN);

      expect(result.isCompatible).toBe(true);
      expect(result.format).toBe(DocumentFormat.MARKDOWN);
    });

    it('routes TXT validation to PlainTextParserAdapter', async () => {
      const txtBuffer = Buffer.from(SAMPLE_SPANISH_TXT, 'utf8');
      const result = await composite.validateCompatibility(txtBuffer, DocumentFormat.TXT);

      expect(result.isCompatible).toBe(true);
      expect(result.format).toBe(DocumentFormat.TXT);
    });

    it('returns incompatible when validating an unsupported format', async () => {
      const buffer = Buffer.from('unsupported content');
      const result = await composite.validateCompatibility(buffer, 'CSV' as DocumentFormat);

      expect(result.isCompatible).toBe(false);
      expect(result.rejectionReason).toContain('CSV');
    });
  });

  describe('Parse Request Routing', () => {
    it('routes PDF parse requests to PDF parser delegate', async () => {
      const pdfBuffer = createSinglePagePdf('Diagnostico Clinico');
      const doc = await composite.parse({
        tenantId: 'tenant-1',
        documentId: 'doc-pdf-route',
        documentVersionId: 'ver-pdf-route',
        format: DocumentFormat.PDF,
        buffer: pdfBuffer,
      });

      expect(doc.sourceFormat).toBe(DocumentFormat.PDF);
      expect(doc.pageCount).toBe(1);
    });

    it('routes DOCX parse requests to DOCX parser delegate', async () => {
      const docxBuffer = createValidDocx();
      const doc = await composite.parse({
        tenantId: 'tenant-1',
        documentId: 'doc-docx-route',
        documentVersionId: 'ver-docx-route',
        format: DocumentFormat.DOCX,
        buffer: docxBuffer,
      });

      expect(doc.sourceFormat).toBe(DocumentFormat.DOCX);
      expect(doc.blocks.length).toBeGreaterThan(0);
    });

    it('routes Markdown parse requests to Markdown parser delegate', async () => {
      const mdBuffer = Buffer.from(SAMPLE_MARKDOWN, 'utf8');
      const doc = await composite.parse({
        tenantId: 'tenant-1',
        documentId: 'doc-md-route',
        documentVersionId: 'ver-md-route',
        format: DocumentFormat.MARKDOWN,
        buffer: mdBuffer,
      });

      expect(doc.sourceFormat).toBe(DocumentFormat.MARKDOWN);
      expect(doc.title).toBe('Protocolo de Atención Kine-Deportiva');
    });

    it('routes TXT parse requests to PlainText parser delegate', async () => {
      const txtBuffer = Buffer.from(SAMPLE_SPANISH_TXT, 'utf8');
      const doc = await composite.parse({
        tenantId: 'tenant-1',
        documentId: 'doc-txt-route',
        documentVersionId: 'ver-txt-route',
        format: DocumentFormat.TXT,
        buffer: txtBuffer,
      });

      expect(doc.sourceFormat).toBe(DocumentFormat.TXT);
      expect(doc.title).toBe('MANUAL DE PROCEDIMIENTOS CLÍNICOS');
    });

    it('throws UnsupportedFormatExtractionException when no delegate matches format', async () => {
      const buffer = Buffer.from('raw data');

      await expect(
        composite.parse({
          tenantId: 'tenant-1',
          documentId: 'doc-unsupported',
          documentVersionId: 'ver-unsupported',
          format: 'XLSX' as DocumentFormat,
          buffer,
        }),
      ).rejects.toThrow(UnsupportedFormatExtractionException);
    });
  });
});
