import * as crypto from 'crypto';
import { DocumentContentValidatorService } from '../document-content-validator.service';
import {
  DocumentFormat,
  DocumentValidationException,
  UnsupportedDocumentFormatException,
  DocumentContentMismatchException,
  DocumentMalformedException,
  DocumentSizeLimitExceededException,
  DocumentSecurityRiskException,
} from '@kinergy-platform/core';
import { DEFAULT_AI_CONFIG } from '../../config/ai.config';

/**
 * In-memory ZIP builder for testing DOCX validation and ZIP bomb defenses without external dependencies.
 */
function buildMockZip(
  entries: Array<{
    name: string;
    content?: Buffer;
    uncompressedSize?: number;
    compressedSize?: number;
  }>,
): Buffer {
  const localHeaders: Buffer[] = [];
  const cdHeaders: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const filenameBuf = Buffer.from(entry.name, 'utf8');
    const data = entry.content ?? Buffer.from('mock content', 'utf8');
    const compSize = entry.compressedSize ?? data.length;
    const uncompSize = entry.uncompressedSize ?? data.length;
    const crc = 0x12345678;

    // Local Header
    const localHeader = Buffer.alloc(30 + filenameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // PK\x03\x04
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(0, 8); // compression method 0 (stored)
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0, 12); // mod date
    localHeader.writeUInt32LE(crc, 14); // crc-32
    localHeader.writeUInt32LE(compSize, 18); // compressed size
    localHeader.writeUInt32LE(uncompSize, 22); // uncompressed size
    localHeader.writeUInt16LE(filenameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra length
    filenameBuf.copy(localHeader, 30);

    const localEntry = Buffer.concat([localHeader, data]);
    localHeaders.push(localEntry);

    // Central Directory Header
    const cdHeader = Buffer.alloc(46 + filenameBuf.length);
    cdHeader.writeUInt32LE(0x02014b50, 0); // PK\x01\x02
    cdHeader.writeUInt16LE(20, 4); // version made by
    cdHeader.writeUInt16LE(20, 6); // version needed
    cdHeader.writeUInt16LE(0, 8); // flags
    cdHeader.writeUInt16LE(0, 10); // compression
    cdHeader.writeUInt16LE(0, 12); // time
    cdHeader.writeUInt16LE(0, 14); // date
    cdHeader.writeUInt32LE(crc, 16); // crc-32
    cdHeader.writeUInt32LE(compSize, 20); // comp size
    cdHeader.writeUInt32LE(uncompSize, 24); // uncomp size
    cdHeader.writeUInt16LE(filenameBuf.length, 28);
    cdHeader.writeUInt16LE(0, 30); // extra
    cdHeader.writeUInt16LE(0, 32); // comment
    cdHeader.writeUInt16LE(0, 34); // disk num
    cdHeader.writeUInt16LE(0, 36); // int attr
    cdHeader.writeUInt32LE(0, 38); // ext attr
    cdHeader.writeUInt32LE(offset, 42); // local header offset
    filenameBuf.copy(cdHeader, 46);

    cdHeaders.push(cdHeader);
    offset += localEntry.length;
  }

  const cdBuf = Buffer.concat(cdHeaders);
  const cdOffset = offset;
  const cdSize = cdBuf.length;

  // End of Central Directory Record
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // PK\x05\x06
  eocd.writeUInt16LE(0, 4); // disk num
  eocd.writeUInt16LE(0, 6); // start disk
  eocd.writeUInt16LE(entries.length, 8); // disk entries
  eocd.writeUInt16LE(entries.length, 10); // total entries
  eocd.writeUInt32LE(cdSize, 12); // CD size
  eocd.writeUInt32LE(cdOffset, 16); // CD offset
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localHeaders, cdBuf, eocd]);
}

describe('DocumentContentValidatorService (Unit)', () => {
  let validator: DocumentContentValidatorService;

  const validPdfBuffer = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n',
  );

  const validDocxBuffer = buildMockZip([
    { name: '[Content_Types].xml', content: Buffer.from('<Types/>') },
    { name: 'word/document.xml', content: Buffer.from('<w:document/>') },
  ]);

  const validMarkdownBuffer = Buffer.from(
    '# Clinical Protocol\n\n- Step 1: Evaluation\n- Step 2: Plan\n',
  );
  const validTextBuffer = Buffer.from('Simple patient appointment notes for clinic visit.\n');

  beforeEach(() => {
    validator = new DocumentContentValidatorService({
      ...DEFAULT_AI_CONFIG,
      maxDocumentSizeBytes: 10 * 1024 * 1024, // 10 MB
    });
  });

  describe('Scenario 1 & 2: Valid Documents (PDF, DOCX, Markdown, TXT)', () => {
    it('validates a valid PDF document with SHA-256 and canonical MIME', () => {
      const result = validator.validate({
        buffer: validPdfBuffer,
        originalFileName: 'clinical-protocol.pdf',
        declaredMimeType: 'application/pdf',
      });

      expect(result.detectedFormat).toBe(DocumentFormat.PDF);
      expect(result.canonicalMimeType).toBe('application/pdf');
      expect(result.sizeBytes).toBe(validPdfBuffer.length);
      expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
      expect(result.checksum).toBe(
        crypto.createHash('sha256').update(validPdfBuffer).digest('hex'),
      );
      expect(result.safeFileName).toBe('clinical-protocol.pdf');
    });

    it('validates a valid DOCX document with OpenXML structures', () => {
      const result = validator.validate({
        buffer: validDocxBuffer,
        originalFileName: 'Assessment_Report.docx',
        declaredMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      expect(result.detectedFormat).toBe(DocumentFormat.DOCX);
      expect(result.canonicalMimeType).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      expect(result.safeFileName).toBe('Assessment_Report.docx');
    });

    it('validates a valid Markdown document', () => {
      const result = validator.validate({
        buffer: validMarkdownBuffer,
        originalFileName: 'guidelines.md',
        declaredMimeType: 'text/markdown',
      });

      expect(result.detectedFormat).toBe(DocumentFormat.MARKDOWN);
      expect(result.canonicalMimeType).toBe('text/markdown');
      expect(result.safeFileName).toBe('guidelines.md');
    });

    it('validates a valid Plain Text document', () => {
      const result = validator.validate({
        buffer: validTextBuffer,
        originalFileName: 'notes.txt',
        declaredMimeType: 'text/plain',
      });

      expect(result.detectedFormat).toBe(DocumentFormat.TXT);
      expect(result.canonicalMimeType).toBe('text/plain');
      expect(result.safeFileName).toBe('notes.txt');
    });
  });

  describe('Scenario 5 & 6: Invalid MIME and Extension/Content Mismatch', () => {
    it('rejects an unsupported binary file (PNG)', () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
      expect(() =>
        validator.validate({
          buffer: pngBuffer,
          originalFileName: 'image.png',
        }),
      ).toThrow(UnsupportedDocumentFormatException);
    });

    it('rejects an unsupported executable binary (ELF)', () => {
      const elfBuffer = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x01, 0x01, 0x01, 0x00]);
      expect(() =>
        validator.validate({
          buffer: elfBuffer,
          originalFileName: 'binary.bin',
        }),
      ).toThrow(UnsupportedDocumentFormatException);
    });

    it('rejects an extension/content mismatch: text file named as .pdf', () => {
      expect(() =>
        validator.validate({
          buffer: validTextBuffer,
          originalFileName: 'fake.pdf',
        }),
      ).toThrow(DocumentContentMismatchException);
    });

    it('rejects an extension/content mismatch: PDF file named as .docx', () => {
      expect(() =>
        validator.validate({
          buffer: validPdfBuffer,
          originalFileName: 'fake.docx',
        }),
      ).toThrow(DocumentContentMismatchException);
    });

    it('rejects declared MIME type mismatch with actual content', () => {
      expect(() =>
        validator.validate({
          buffer: validPdfBuffer,
          originalFileName: 'doc.pdf',
          declaredMimeType: 'text/plain',
        }),
      ).toThrow(DocumentContentMismatchException);
    });
  });

  describe('Scenario 7: Malformed and Malicious PDF Files', () => {
    it('rejects a PDF missing the %%EOF trailer', () => {
      const corruptPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n');
      expect(() =>
        validator.validate({
          buffer: corruptPdf,
          originalFileName: 'corrupt.pdf',
        }),
      ).toThrow(DocumentMalformedException);
    });

    it('rejects a PDF with an invalid version header', () => {
      const invalidHeaderPdf = Buffer.from('%PDF-9.9\n1 0 obj\nendobj\n%%EOF');
      expect(() =>
        validator.validate({
          buffer: invalidHeaderPdf,
          originalFileName: 'invalid-ver.pdf',
        }),
      ).toThrow(DocumentMalformedException);
    });

    it('rejects a PDF containing a malicious /Launch action', () => {
      const maliciousPdf = Buffer.from(
        '%PDF-1.4\n1 0 obj\n<< /Type /Action /S /Launch /F (cmd.exe) >>\nendobj\ntrailer\n<< >>\n%%EOF',
      );
      expect(() =>
        validator.validate({
          buffer: maliciousPdf,
          originalFileName: 'malicious.pdf',
        }),
      ).toThrow(DocumentSecurityRiskException);
    });

    it('rejects a PDF containing embedded /JavaScript execution', () => {
      const jsPdf = Buffer.from(
        '%PDF-1.4\n1 0 obj\n<< /Type /Action /S /JavaScript /JS (app.alert(1)) >>\nendobj\ntrailer\n<< >>\n%%EOF',
      );
      expect(() =>
        validator.validate({
          buffer: jsPdf,
          originalFileName: 'script.pdf',
        }),
      ).toThrow(DocumentSecurityRiskException);
    });
  });

  describe('Scenario 8 & 9: Corrupt DOCX and ZIP Bomb Defense', () => {
    it('rejects a DOCX missing required [Content_Types].xml', () => {
      const missingTypes = buildMockZip([
        { name: 'word/document.xml', content: Buffer.from('<w:document/>') },
      ]);
      expect(() =>
        validator.validate({
          buffer: missingTypes,
          originalFileName: 'missing-types.docx',
        }),
      ).toThrow(DocumentMalformedException);
    });

    it('rejects a DOCX missing required word/document.xml', () => {
      const missingDoc = buildMockZip([
        { name: '[Content_Types].xml', content: Buffer.from('<Types/>') },
      ]);
      expect(() =>
        validator.validate({
          buffer: missingDoc,
          originalFileName: 'missing-doc.docx',
        }),
      ).toThrow(DocumentMalformedException);
    });

    it('rejects a corrupted ZIP container missing the EOCD record', () => {
      const corruptZip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
      expect(() =>
        validator.validate({
          buffer: corruptZip,
          originalFileName: 'broken.docx',
        }),
      ).toThrow(DocumentMalformedException);
    });

    it('triggers ZIP bomb defense when entry count exceeds 1,000', () => {
      const bombEntries = Array.from({ length: 1001 }, (_, i) => ({
        name: `file_${i}.xml`,
        content: Buffer.from('x'),
      }));
      const bombBuffer = buildMockZip(bombEntries);

      expect(() =>
        validator.validate({
          buffer: bombBuffer,
          originalFileName: 'bomb-entries.docx',
        }),
      ).toThrow(DocumentSecurityRiskException);
    });

    it('triggers ZIP bomb defense when entry compression ratio exceeds 100:1', () => {
      const ratioBomb = buildMockZip([
        {
          name: '[Content_Types].xml',
          content: Buffer.from('x'),
          compressedSize: 10,
          uncompressedSize: 2000, // 200:1 ratio
        },
        { name: 'word/document.xml', content: Buffer.from('y') },
      ]);

      expect(() =>
        validator.validate({
          buffer: ratioBomb,
          originalFileName: 'ratio-bomb.docx',
        }),
      ).toThrow(DocumentSecurityRiskException);
    });

    it('triggers ZIP bomb defense when uncompressed size exceeds 50 MB', () => {
      const sizeBomb = buildMockZip([
        {
          name: '[Content_Types].xml',
          content: Buffer.from('x'),
          compressedSize: 1000,
          uncompressedSize: 60 * 1024 * 1024, // 60 MB uncompressed
        },
        { name: 'word/document.xml', content: Buffer.from('y') },
      ]);

      expect(() =>
        validator.validate({
          buffer: sizeBomb,
          originalFileName: 'size-bomb.docx',
        }),
      ).toThrow(DocumentSecurityRiskException);
    });
  });

  describe('Scenario 10 & 11: File Size Limits and Empty Files', () => {
    it('rejects an empty buffer (0 bytes)', () => {
      expect(() =>
        validator.validate({
          buffer: Buffer.alloc(0),
          originalFileName: 'empty.pdf',
        }),
      ).toThrow(DocumentValidationException);
    });

    it('rejects an oversized file exceeding maximum configured size', () => {
      const smallLimitValidator = new DocumentContentValidatorService({
        ...DEFAULT_AI_CONFIG,
        maxDocumentSizeBytes: 50, // 50 bytes limit, validPdfBuffer is ~81 bytes
      });

      expect(() =>
        smallLimitValidator.validate({
          buffer: validPdfBuffer,
          originalFileName: 'large.pdf',
        }),
      ).toThrow(DocumentSizeLimitExceededException);
    });
  });

  describe('Scenario 12: Unicode Filenames', () => {
    it('generates a safe ASCII filename preserving extension for Unicode filenames', () => {
      const result = validator.validate({
        buffer: validPdfBuffer,
        originalFileName: 'файл_клиника_пациент.pdf',
      });

      expect(result.safeFileName).toMatch(/^[a-zA-Z0-9._-]+\.pdf$/);
    });

    it('handles Japanese/CJK filenames safely', () => {
      const result = validator.validate({
        buffer: validDocxBuffer,
        originalFileName: '患者カルテ_2026.docx',
      });

      expect(result.safeFileName).toMatch(/^[a-zA-Z0-9._-]+\.docx$/);
    });
  });

  describe('Markdown and Text Binary Protection', () => {
    it('rejects text containing illegal null bytes', () => {
      const nullByteText = Buffer.from('Hello\x00World');
      expect(() =>
        validator.validate({
          buffer: nullByteText,
          originalFileName: 'null.txt',
        }),
      ).toThrow(UnsupportedDocumentFormatException);
    });

    it('rejects text containing malformed UTF-8 sequences', () => {
      const invalidUtf8 = Buffer.from([0xff, 0xfe, 0x90, 0x80]);
      expect(() =>
        validator.validate({
          buffer: invalidUtf8,
          originalFileName: 'invalid.txt',
        }),
      ).toThrow(UnsupportedDocumentFormatException);
    });
  });
});
