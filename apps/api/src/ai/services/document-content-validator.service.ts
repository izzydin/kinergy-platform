import * as crypto from 'crypto';
import * as path from 'path';
import { Inject, Injectable } from '@nestjs/common';
import {
  DocumentFormat,
  DocumentValidationException,
  UnsupportedDocumentFormatException,
  DocumentContentMismatchException,
  DocumentMalformedException,
  DocumentSizeLimitExceededException,
  DocumentSecurityRiskException,
} from '@kinergy-platform/core';
import { AI_CONFIG_TOKEN } from '../ai.tokens';
import { AiConfiguration } from '../config/ai.config';
import { StorageKeyUtil } from '../../platform/storage/utils/storage-key.util';

export interface DocumentValidationInput {
  buffer: Buffer;
  originalFileName: string;
  declaredMimeType?: string;
  maxSizeBytes?: number;
}

export interface ValidatedDocumentOutput {
  detectedFormat: DocumentFormat;
  canonicalMimeType: string;
  checksum: string;
  sizeBytes: number;
  safeFileName: string;
}

/**
 * Maximum decompressed size for DOCX archives (50 MB) - ZIP bomb defense
 */
const MAX_DOCX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;

/**
 * Maximum archive entry count for DOCX archives - ZIP bomb defense
 */
const MAX_DOCX_ENTRY_COUNT = 1000;

/**
 * Maximum compression ratio allowed per DOCX entry - ZIP bomb defense
 */
const MAX_DOCX_COMPRESSION_RATIO = 100;

@Injectable()
export class DocumentContentValidatorService {
  constructor(
    @Inject(AI_CONFIG_TOKEN)
    private readonly config: AiConfiguration,
  ) {}

  /**
   * Validates document size, authenticates content magic bytes and structure,
   * detects MIME/extension mismatches, enforces security constraints, and computes SHA-256.
   */
  public validate(input: DocumentValidationInput): ValidatedDocumentOutput {
    const { buffer, originalFileName, declaredMimeType } = input;
    const maxSizeBytes = input.maxSizeBytes ?? this.config.maxDocumentSizeBytes;

    // 1. File size checks
    if (!buffer || buffer.length === 0) {
      throw new DocumentValidationException('Document file is empty (0 bytes).', 'EMPTY_FILE');
    }

    if (buffer.length > maxSizeBytes) {
      throw new DocumentSizeLimitExceededException(buffer.length, maxSizeBytes);
    }

    // 2. Validate original file name
    if (
      !originalFileName ||
      typeof originalFileName !== 'string' ||
      originalFileName.trim().length === 0
    ) {
      throw new DocumentValidationException('Original file name is required and cannot be empty.');
    }

    if (originalFileName.includes('\0')) {
      throw new DocumentValidationException('Original file name contains illegal null bytes.');
    }

    const rawExt = path.extname(originalFileName).toLowerCase().replace(/^\./, '');
    if (!rawExt) {
      throw new DocumentValidationException(
        `File '${originalFileName}' is missing a valid file extension.`,
      );
    }

    // 3. Detect format from content bytes (Content Sniffing)
    const detectedFormat = this.detectContentFormat(buffer, rawExt);

    // 4. Validate format-specific structural integrity and security constraints
    this.validateFormatStructure(buffer, detectedFormat);

    // 5. Verify extension and declared MIME consistency
    this.assertExtensionMatchesFormat(rawExt, detectedFormat);
    if (declaredMimeType) {
      this.assertMimeMatchesFormat(declaredMimeType, detectedFormat);
    }

    // 6. Compute cryptographic SHA-256 checksum
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

    // 7. Generate safe file name preserving extension
    const safeFileName = this.generateSafeFileName(originalFileName, rawExt);

    return {
      detectedFormat,
      canonicalMimeType: detectedFormat,
      checksum,
      sizeBytes: buffer.length,
      safeFileName,
    };
  }

  /**
   * Sniffs magic bytes to determine the actual content format.
   */
  private detectContentFormat(buffer: Buffer, rawExt: string): DocumentFormat {
    // Check PDF magic bytes (%PDF-)
    if (
      buffer.length >= 5 &&
      buffer[0] === 0x25 && // %
      buffer[1] === 0x50 && // P
      buffer[2] === 0x44 && // D
      buffer[3] === 0x46 && // F
      buffer[4] === 0x2d // -
    ) {
      return DocumentFormat.PDF;
    }

    // Check ZIP magic bytes (PK\x03\x04 or PK\x05\x06 for empty zip)
    if (
      buffer.length >= 4 &&
      buffer[0] === 0x50 && // P
      buffer[1] === 0x4b && // K
      ((buffer[2] === 0x03 && buffer[3] === 0x04) || (buffer[2] === 0x05 && buffer[3] === 0x06))
    ) {
      return DocumentFormat.DOCX;
    }

    // Check for binary signatures that are definitely not text
    if (this.isKnownBinaryFormat(buffer)) {
      throw new UnsupportedDocumentFormatException(rawExt || 'binary');
    }

    // Check if buffer is valid UTF-8 text without illegal null bytes
    if (this.isValidUtf8Text(buffer)) {
      if (rawExt === 'md' || rawExt === 'markdown') {
        return DocumentFormat.MARKDOWN;
      }
      return DocumentFormat.TXT;
    }

    throw new UnsupportedDocumentFormatException(rawExt);
  }

  /**
   * Identifies common non-supported binary files (images, executables, ELF, archives).
   */
  private isKnownBinaryFormat(buffer: Buffer): boolean {
    if (buffer.length < 4) return false;

    // PNG
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47)
      return true;
    // JPEG
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;
    // GIF
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return true;
    // ELF / Mach-O / Windows PE
    if (buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46)
      return true;
    if (buffer[0] === 0x4d && buffer[1] === 0x5a) return true; // MZ (EXE)

    return false;
  }

  /**
   * Verifies that the buffer contains strictly valid UTF-8 and no null/binary control bytes.
   */
  private isValidUtf8Text(buffer: Buffer): boolean {
    // Fast check for null bytes
    if (buffer.includes(0x00)) {
      return false;
    }

    // Strict UTF-8 decoding
    try {
      const decoder = new TextDecoder('utf-8', { fatal: true });
      const decoded = decoder.decode(buffer);

      // Verify no control characters other than tab (9), linefeed (10), carriage return (13)
      for (let i = 0; i < decoded.length; i++) {
        const code = decoded.charCodeAt(i);
        if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
          return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Deep structural validation based on format.
   */
  private validateFormatStructure(buffer: Buffer, format: DocumentFormat): void {
    switch (format) {
      case DocumentFormat.PDF:
        this.validatePdfStructure(buffer);
        break;
      case DocumentFormat.DOCX:
        this.validateDocxStructure(buffer);
        break;
      case DocumentFormat.MARKDOWN:
      case DocumentFormat.TXT:
        this.validateTextStructure(buffer);
        break;
    }
  }

  /**
   * Validates PDF trailer, structure, and checks for prohibited script execution.
   */
  private validatePdfStructure(buffer: Buffer): void {
    const rawAscii = buffer.toString('latin1');

    // 1. Check version format (%PDF-1.x or %PDF-2.x)
    const header = rawAscii.substring(0, 10);
    const versionMatch = header.match(/^%PDF-([12]\.[0-9])/);
    if (!versionMatch) {
      throw new DocumentMalformedException('Invalid or missing PDF version header.');
    }

    // 2. Check for EOF marker
    const tail = rawAscii.slice(-2048);
    if (!tail.includes('%%EOF') && !rawAscii.includes('%%EOF')) {
      throw new DocumentMalformedException('PDF missing required %%EOF trailer marker.');
    }

    // 3. Security: Check for active code execution (/Launch, /JavaScript)
    if (rawAscii.includes('/Launch')) {
      throw new DocumentSecurityRiskException(
        'PDF contains prohibited active launch action (/Launch).',
      );
    }

    if (
      rawAscii.includes('/JavaScript') ||
      rawAscii.includes('/JS ') ||
      rawAscii.includes('/JS\r') ||
      rawAscii.includes('/JS\n')
    ) {
      throw new DocumentSecurityRiskException(
        'PDF contains prohibited executable JavaScript (/JavaScript).',
      );
    }
  }

  /**
   * Validates DOCX OpenXML structure and enforces ZIP bomb limits.
   */
  private validateDocxStructure(buffer: Buffer): void {
    // 1. Locate End of Central Directory (EOCD)
    // EOCD signature is 0x06054b50
    let eocdOffset = -1;
    const searchStart = Math.max(0, buffer.length - 65557);
    for (let i = buffer.length - 22; i >= searchStart; i--) {
      if (buffer.readUInt32LE(i) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }

    if (eocdOffset === -1) {
      throw new DocumentMalformedException(
        'Invalid DOCX container: End of Central Directory record not found.',
      );
    }

    // 2. Read central directory metadata
    const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
    const cdSize = buffer.readUInt32LE(eocdOffset + 12);
    const cdOffset = buffer.readUInt32LE(eocdOffset + 16);

    // ZIP bomb protection: max entry count
    if (totalEntries > MAX_DOCX_ENTRY_COUNT) {
      throw new DocumentSecurityRiskException(
        `DOCX archive contains ${totalEntries} entries, exceeding maximum safe limit of ${MAX_DOCX_ENTRY_COUNT} (ZIP bomb defense).`,
      );
    }

    if (cdOffset + cdSize > buffer.length || cdOffset < 0) {
      throw new DocumentMalformedException(
        'Corrupt DOCX archive: Central Directory offset out of bounds.',
      );
    }

    let currentOffset = cdOffset;
    let accumulatedUncompressedSize = 0;
    const entryNames = new Set<string>();

    for (let i = 0; i < totalEntries; i++) {
      if (currentOffset + 46 > buffer.length) {
        throw new DocumentMalformedException(
          'Corrupt DOCX archive: Central Directory entry truncated.',
        );
      }

      const sig = buffer.readUInt32LE(currentOffset);
      if (sig !== 0x02014b50) {
        throw new DocumentMalformedException(
          `Invalid Central Directory header signature at offset ${currentOffset}.`,
        );
      }

      const compressedSize = buffer.readUInt32LE(currentOffset + 20);
      const uncompressedSize = buffer.readUInt32LE(currentOffset + 24);
      const filenameLength = buffer.readUInt16LE(currentOffset + 28);
      const extraLength = buffer.readUInt16LE(currentOffset + 30);
      const commentLength = buffer.readUInt16LE(currentOffset + 32);

      // ZIP bomb protection: compression ratio
      if (compressedSize > 0) {
        const ratio = uncompressedSize / compressedSize;
        if (ratio > MAX_DOCX_COMPRESSION_RATIO) {
          throw new DocumentSecurityRiskException(
            `DOCX entry compression ratio (${ratio.toFixed(1)}:1) exceeds safe limit of ${MAX_DOCX_COMPRESSION_RATIO}:1 (ZIP bomb defense).`,
          );
        }
      }

      accumulatedUncompressedSize += uncompressedSize;
      if (accumulatedUncompressedSize > MAX_DOCX_UNCOMPRESSED_BYTES) {
        throw new DocumentSecurityRiskException(
          `DOCX uncompressed size exceeds maximum safe limit of ${MAX_DOCX_UNCOMPRESSED_BYTES / (1024 * 1024)} MB (ZIP bomb defense).`,
        );
      }

      const filenameOffset = currentOffset + 46;
      if (filenameOffset + filenameLength > buffer.length) {
        throw new DocumentMalformedException(
          'Corrupt DOCX archive: entry filename exceeds buffer length.',
        );
      }

      const filename = buffer
        .subarray(filenameOffset, filenameOffset + filenameLength)
        .toString('utf8');

      // Archive path traversal check
      if (
        filename.includes('..') ||
        filename.startsWith('/') ||
        filename.startsWith('\\') ||
        /^[a-zA-Z]:/.test(filename) ||
        filename.includes('\0')
      ) {
        throw new DocumentSecurityRiskException(
          `DOCX archive contains forbidden path traversal entry: '${filename}'.`,
        );
      }

      // Nested archive check
      if (/\.(zip|tar|gz|bz2|7z|rar|xz)$/i.test(filename)) {
        throw new DocumentSecurityRiskException(
          `DOCX archive contains prohibited nested archive: '${filename}'.`,
        );
      }

      entryNames.add(filename);

      currentOffset += 46 + filenameLength + extraLength + commentLength;
    }

    // 3. Confirm expected OpenXML parts
    if (!entryNames.has('[Content_Types].xml')) {
      throw new DocumentMalformedException(
        'DOCX package missing required [Content_Types].xml manifest.',
      );
    }

    if (!entryNames.has('word/document.xml')) {
      throw new DocumentMalformedException(
        'DOCX package missing main document part (word/document.xml).',
      );
    }
  }

  /**
   * Validates plain text and markdown byte sequences.
   */
  private validateTextStructure(buffer: Buffer): void {
    if (buffer.includes(0x00)) {
      throw new DocumentMalformedException('Text document contains illegal null bytes (0x00).');
    }

    try {
      const decoder = new TextDecoder('utf-8', { fatal: true });
      decoder.decode(buffer);
    } catch {
      throw new DocumentMalformedException(
        'Text document contains malformed UTF-8 encoding sequences.',
      );
    }
  }

  /**
   * Asserts that file extension is consistent with detected format.
   */
  private assertExtensionMatchesFormat(rawExt: string, detectedFormat: DocumentFormat): void {
    const ext = rawExt.toLowerCase();

    switch (detectedFormat) {
      case DocumentFormat.PDF:
        if (ext !== 'pdf') {
          throw new DocumentContentMismatchException(
            `File extension '.${rawExt}' does not match detected PDF content.`,
          );
        }
        break;

      case DocumentFormat.DOCX:
        if (ext !== 'docx') {
          throw new DocumentContentMismatchException(
            `File extension '.${rawExt}' does not match detected DOCX content.`,
          );
        }
        break;

      case DocumentFormat.MARKDOWN:
        if (ext !== 'md' && ext !== 'markdown') {
          throw new DocumentContentMismatchException(
            `File extension '.${rawExt}' does not match detected Markdown content.`,
          );
        }
        break;

      case DocumentFormat.TXT:
        if (ext !== 'txt' && ext !== 'text') {
          throw new DocumentContentMismatchException(
            `File extension '.${rawExt}' does not match detected Plain Text content.`,
          );
        }
        break;
    }
  }

  /**
   * Asserts that declared MIME matches detected format.
   */
  private assertMimeMatchesFormat(declaredMime: string, detectedFormat: DocumentFormat): void {
    const normalized = declaredMime.toLowerCase().trim();

    switch (detectedFormat) {
      case DocumentFormat.PDF:
        if (normalized !== DocumentFormat.PDF) {
          throw new DocumentContentMismatchException(
            `Declared MIME '${declaredMime}' does not match detected PDF content.`,
          );
        }
        break;

      case DocumentFormat.DOCX:
        if (normalized !== DocumentFormat.DOCX && normalized !== 'application/zip') {
          throw new DocumentContentMismatchException(
            `Declared MIME '${declaredMime}' does not match detected DOCX content.`,
          );
        }
        break;

      case DocumentFormat.MARKDOWN:
        if (
          normalized !== DocumentFormat.MARKDOWN &&
          normalized !== 'text/x-markdown' &&
          normalized !== 'text/plain'
        ) {
          throw new DocumentContentMismatchException(
            `Declared MIME '${declaredMime}' does not match detected Markdown content.`,
          );
        }
        break;

      case DocumentFormat.TXT:
        if (normalized !== DocumentFormat.TXT && normalized !== 'text/plain') {
          throw new DocumentContentMismatchException(
            `Declared MIME '${declaredMime}' does not match detected Plain Text content.`,
          );
        }
        break;
    }
  }

  /**
   * Generates a sanitized ASCII-safe filename for internal storage keys while preserving the extension.
   */
  private generateSafeFileName(originalFileName: string, ext: string): string {
    const sanitized = StorageKeyUtil.sanitizeFilename(originalFileName);
    // If sanitized is just the extension or empty, provide standard fallback
    if (sanitized === ext || sanitized === `.${ext}` || sanitized === 'attachment') {
      return `document.${ext}`;
    }
    return sanitized;
  }
}
