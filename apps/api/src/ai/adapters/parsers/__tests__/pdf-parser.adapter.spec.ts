import { PdfParserAdapter } from '../pdf-parser.adapter';
import {
  DocumentFormat,
  ExtractedBlockType,
  InvalidFormatExtractionException,
  UnsupportedDocumentFeatureException,
  ExtractionResourceLimitExceededException,
} from '@kinergy-platform/core';
import {
  createSinglePagePdf,
  createMultiPagePdf,
  createImageOnlyPdf,
  createEncryptedPdf,
} from './parser-fixtures';

describe('PdfParserAdapter (Unit & Security)', () => {
  let adapter: PdfParserAdapter;

  beforeEach(() => {
    adapter = new PdfParserAdapter();
  });

  describe('Format Support & Preflight Validation', () => {
    it('declares support strictly for DocumentFormat.PDF', () => {
      expect(adapter.supportsFormat(DocumentFormat.PDF)).toBe(true);
      expect(adapter.supportsFormat(DocumentFormat.DOCX)).toBe(false);
      expect(adapter.supportsFormat(DocumentFormat.MARKDOWN)).toBe(false);
      expect(adapter.supportsFormat(DocumentFormat.TXT)).toBe(false);
    });

    it('validates a valid single-page digital PDF buffer successfully', async () => {
      const validPdf = createSinglePagePdf('Evaluación Kine');
      const compat = await adapter.validateCompatibility(validPdf, DocumentFormat.PDF);

      expect(compat.isCompatible).toBe(true);
      expect(compat.detectedMimeType).toBe('application/pdf');
    });

    it('rejects encrypted PDFs during compatibility validation', async () => {
      const encPdf = createEncryptedPdf();
      const compat = await adapter.validateCompatibility(encPdf, DocumentFormat.PDF);

      expect(compat.isCompatible).toBe(false);
      expect(compat.rejectionReason).toContain('encrypted');
      expect(compat.unsupportedFeatures).toContain('ENCRYPTED_PDF');
    });

    it('rejects buffers exceeding maximum size limit', async () => {
      const limitedAdapter = new PdfParserAdapter({ maxSizeBytes: 50 });
      const validPdf = createSinglePagePdf('Short');
      const compat = await limitedAdapter.validateCompatibility(validPdf, DocumentFormat.PDF);

      expect(compat.isCompatible).toBe(false);
      expect(compat.rejectionReason).toContain('exceeds limit');
    });
  });

  describe('Extraction & Structure Preservation', () => {
    it('extracts single-page PDF text with PAGE_BOUNDARY and PARAGRAPH blocks', async () => {
      const pdfBuffer = createSinglePagePdf('Tratamiento de Ondas de Choque');

      const doc = await adapter.parse({
        tenantId: 'tenant-1',
        documentId: 'doc-pdf-1',
        documentVersionId: 'ver-pdf-1',
        format: DocumentFormat.PDF,
        buffer: pdfBuffer,
        originalFileName: 'ondas-choque.pdf',
      });

      expect(doc.documentId).toBe('doc-pdf-1');
      expect(doc.documentVersionId).toBe('ver-pdf-1');
      expect(doc.sourceFormat).toBe(DocumentFormat.PDF);
      expect(doc.metadata.pageCount).toBe(1);
      expect(doc.pageCount).toBe(1);

      // Verify page boundary marker
      const boundaries = doc.getBlocksByType(ExtractedBlockType.PAGE_BOUNDARY);
      expect(boundaries.length).toBe(1);
      expect(boundaries[0]?.pageNumber).toBe(1);

      // Verify text was extracted
      expect(doc.toFullPlainText()).toContain('Tratamiento de Ondas de Choque');
    });

    it('extracts multi-page PDF preserving sequential page boundaries and numbers (1, 2)', async () => {
      const pdfBuffer = createMultiPagePdf(
        'Diagnostico de Tendinopatia',
        'Prescripcion de Ejercicio Excentrico',
      );

      const doc = await adapter.parse({
        tenantId: 'tenant-1',
        documentId: 'doc-pdf-multi',
        documentVersionId: 'ver-pdf-multi',
        format: DocumentFormat.PDF,
        buffer: pdfBuffer,
        originalFileName: 'tendinopatia.pdf',
      });

      expect(doc.pageCount).toBe(2);
      expect(doc.metadata.pageCount).toBe(2);

      const boundaries = doc.getBlocksByType(ExtractedBlockType.PAGE_BOUNDARY);
      expect(boundaries.length).toBe(2);
      expect(boundaries[0]?.pageNumber).toBe(1);
      expect(boundaries[1]?.pageNumber).toBe(2);

      const page1Blocks = doc.getBlocksForPage(1);
      const page2Blocks = doc.getBlocksForPage(2);
      expect(page1Blocks.some((b) => b.text.includes('Tendinopatia'))).toBe(true);
      expect(page2Blocks.some((b) => b.text.includes('Excentrico'))).toBe(true);
    });
  });

  describe('Security & Failure Classification', () => {
    it('detects image-only/scanned PDF and throws UnsupportedDocumentFeatureException (OCR_REQUIRED)', async () => {
      const scannedPdf = createImageOnlyPdf();

      await expect(
        adapter.parse({
          tenantId: 'tenant-1',
          documentId: 'doc-scanned',
          documentVersionId: 'ver-scanned',
          format: DocumentFormat.PDF,
          buffer: scannedPdf,
        }),
      ).rejects.toThrow(UnsupportedDocumentFeatureException);

      await expect(
        adapter.parse({
          tenantId: 'tenant-1',
          documentId: 'doc-scanned',
          documentVersionId: 'ver-scanned',
          format: DocumentFormat.PDF,
          buffer: scannedPdf,
        }),
      ).rejects.toThrow(/OCR_REQUIRED/i);
    });

    it('rejects encrypted PDFs with UnsupportedDocumentFeatureException (ENCRYPTED_PDF)', async () => {
      const encryptedPdf = createEncryptedPdf();

      await expect(
        adapter.parse({
          tenantId: 'tenant-1',
          documentId: 'doc-enc',
          documentVersionId: 'ver-enc',
          format: DocumentFormat.PDF,
          buffer: encryptedPdf,
        }),
      ).rejects.toThrow(UnsupportedDocumentFeatureException);
    });

    it('rejects corrupted PDF buffers with InvalidFormatExtractionException', async () => {
      const corruptPdf = Buffer.from(
        '%PDF-1.4\nCorrupted binary content without xref table\n%%EOF',
      );

      await expect(
        adapter.parse({
          tenantId: 'tenant-1',
          documentId: 'doc-corrupt',
          documentVersionId: 'ver-corrupt',
          format: DocumentFormat.PDF,
          buffer: corruptPdf,
        }),
      ).rejects.toThrow(InvalidFormatExtractionException);
    });

    it('enforces maximum buffer size constraint', async () => {
      const smallLimitAdapter = new PdfParserAdapter({ maxSizeBytes: 50 });
      const pdfBuffer = createSinglePagePdf('Oversized Buffer Test');

      await expect(
        smallLimitAdapter.parse({
          tenantId: 'tenant-1',
          documentId: 'doc-large',
          documentVersionId: 'ver-large',
          format: DocumentFormat.PDF,
          buffer: pdfBuffer,
        }),
      ).rejects.toThrow(ExtractionResourceLimitExceededException);
    });
  });
});
