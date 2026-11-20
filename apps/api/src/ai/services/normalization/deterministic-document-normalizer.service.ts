import { Injectable } from '@nestjs/common';
import {
  IDocumentNormalizerPort,
  ExtractedDocument,
  ExtractedBlock,
  ExtractedBlockType,
  NormalizedDocument,
  NormalizedBlock,
  NormalizationConfig,
  DetectedLanguageResult,
} from '@kinergy-platform/core';
import { DeterministicLanguageDetectorService } from './deterministic-language-detector.service';

// Control characters regex: ASCII 0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F, and 0x7F (DEL)
// Preserves \t (0x09) and \n (0x0A)
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

// Invisible formatting artifacts: soft hyphen, zero-width space, BOM, ZWNJ, ZWJ
const FORMATTING_ARTIFACTS_REGEX = /[\u00AD\u200B\uFEFF\u200C\u200D]/g;

// Line break hyphenation unwrapping: e.g. "rehabili-\ntación" -> "rehabilitación"
// Preserves compound words with capitalized second parts or spaces
const HYPHENATION_UNWRAP_REGEX = /([a-záéíóúüñA-ZÁÉÍÓÚÜÑ]{2,})-\n([a-záéíóúüñ]{2,})/g;

@Injectable()
export class DeterministicDocumentNormalizerService implements IDocumentNormalizerPort {
  constructor(
    private readonly languageDetector: DeterministicLanguageDetectorService = new DeterministicLanguageDetectorService(),
  ) {}

  public async normalize(
    document: ExtractedDocument,
    configOverrides?: Partial<NormalizationConfig>,
  ): Promise<NormalizedDocument> {
    const config = configOverrides
      ? NormalizationConfig.create(configOverrides)
      : NormalizationConfig.default();

    const normalizedBlocks: NormalizedBlock[] = [];
    const headerFooterArtifactIds = config.cleanHeaderFooterArtifacts
      ? this.detectHeaderFooterArtifacts(document.blocks)
      : new Set<string>();

    let sequenceCounter = 0;

    for (const sourceBlock of document.blocks) {
      const isArtifact = headerFooterArtifactIds.has(sourceBlock.id);
      const originalLength = sourceBlock.text.length;
      const transformationsApplied: string[] = [];

      let normalizedText: string;

      if (
        sourceBlock.type === ExtractedBlockType.PAGE_BOUNDARY ||
        sourceBlock.type === ExtractedBlockType.DIVIDER
      ) {
        // Structural boundary blocks are preserved verbatim
        normalizedText = sourceBlock.text;
      } else if (sourceBlock.type === ExtractedBlockType.CODE_BLOCK) {
        // Code blocks must preserve exact indentation and line breaks
        normalizedText = this.normalizeCodeBlock(sourceBlock.text, config, transformationsApplied);
      } else if (sourceBlock.type === ExtractedBlockType.TABLE) {
        // Tables must preserve markdown pipe structure and row/col matrix
        normalizedText = this.normalizeTable(sourceBlock.text, config, transformationsApplied);
      } else {
        // Standard prose: Headings, Paragraphs, Lists, Blockquotes
        normalizedText = this.normalizeProse(sourceBlock.text, config, transformationsApplied);
      }

      // Detect language for text-bearing blocks if enabled
      let blockLanguage: DetectedLanguageResult | null = null;
      if (
        config.detectLanguage &&
        normalizedText.length >= config.minLanguageDetectionChars &&
        sourceBlock.type !== ExtractedBlockType.CODE_BLOCK &&
        sourceBlock.type !== ExtractedBlockType.PAGE_BOUNDARY &&
        sourceBlock.type !== ExtractedBlockType.DIVIDER
      ) {
        blockLanguage = this.languageDetector.detectLanguage(normalizedText);
      }

      normalizedBlocks.push(
        NormalizedBlock.create({
          sourceBlockId: sourceBlock.id,
          type: sourceBlock.type,
          text: normalizedText,
          originalLength,
          sequence: sequenceCounter++,
          headingLevel: sourceBlock.headingLevel,
          sectionPath: sourceBlock.sectionPath,
          pageNumber: sourceBlock.pageNumber,
          location: sourceBlock.location,
          tableMetadata: sourceBlock.tableMetadata,
          codeLanguage: sourceBlock.codeLanguage,
          detectedLanguage: blockLanguage,
          transformationsApplied,
          isHeaderOrFooterArtifact: isArtifact,
          metadata: {
            ...sourceBlock.metadata,
            sourceBlockCharDelta: normalizedText.length - originalLength,
          },
        }),
      );
    }

    // Determine document-level language
    const documentLanguage = config.detectLanguage
      ? this.languageDetector.detectDocumentLanguage(
          normalizedBlocks.map((b) => ({ text: b.text, type: b.type })),
        )
      : DetectedLanguageResult.undetermined(0);

    const originalTotalChars = document.blocks.reduce((acc, b) => acc + b.charCount, 0);
    const normalizedTotalChars = normalizedBlocks.reduce((acc, b) => acc + b.charCount, 0);

    return NormalizedDocument.create({
      documentId: document.documentId,
      documentVersionId: document.documentVersionId,
      sourceFormat: document.sourceFormat,
      title: document.title,
      documentLanguage,
      blocks: normalizedBlocks,
      normalizationConfig: config,
      metadata: {
        normalizerName: 'deterministic-document-normalizer',
        normalizerVersion: config.version,
        originalTotalChars,
        normalizedTotalChars,
        pageCount: document.pageCount,
        transformationCount: normalizedBlocks.reduce(
          (acc, b) => acc + b.transformationsApplied.length,
          0,
        ),
        headerFooterArtifactsDetected: headerFooterArtifactIds.size,
        custom: {
          originalBlockCount: document.blockCount,
          normalizedBlockCount: normalizedBlocks.length,
        },
      },
      normalizedAt: new Date(),
    });
  }

  /**
   * Normalizes standard prose blocks (Headings, Paragraphs, Lists, Blockquotes).
   */
  private normalizeProse(
    text: string,
    config: NormalizationConfig,
    transformations: string[],
  ): string {
    let result = text;

    // 1. Line ending normalization
    if (config.normalizeLineEndings && (result.includes('\r\n') || result.includes('\r'))) {
      result = result.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      transformations.push('NORMALIZE_LINE_ENDINGS');
    }

    // 2. Control characters removal
    if (config.stripControlChars && CONTROL_CHARS_REGEX.test(result)) {
      result = result.replace(CONTROL_CHARS_REGEX, '');
      transformations.push('STRIP_CONTROL_CHARS');
    }

    // 3. Formatting artifacts removal (soft hyphens, zero-width spaces, BOM)
    if (config.removeFormattingArtifacts && FORMATTING_ARTIFACTS_REGEX.test(result)) {
      result = result.replace(FORMATTING_ARTIFACTS_REGEX, '');
      transformations.push('REMOVE_FORMATTING_ARTIFACTS');
    }

    // 4. Unicode normalization (NFC preserves math, currency, and accents)
    if (config.unicodePolicy !== 'NONE') {
      const normalizedUnicode = result.normalize(config.unicodePolicy);
      if (normalizedUnicode !== result) {
        result = normalizedUnicode;
        transformations.push(`UNICODE_${config.unicodePolicy}`);
      }
    }

    // 5. Line break hyphenation unwrapping (e.g. "rehabili-\ntación" -> "rehabilitación")
    if (config.unwrapHyphenation && HYPHENATION_UNWRAP_REGEX.test(result)) {
      result = result.replace(HYPHENATION_UNWRAP_REGEX, '$1$2');
      transformations.push('UNWRAP_HYPHENATION');
    }

    // 6. Whitespace collapse (multiple spaces/tabs collapse to 1, clean blank lines)
    if (config.collapseWhitespace) {
      const original = result;
      // Collapse horizontal tabs/spaces
      result = result
        .split('\n')
        .map((line) => line.replace(/[ \t]+/g, ' ').trim())
        .join('\n');

      // Collapse 3+ consecutive newlines to 2 newlines (paragraph boundary)
      result = result.replace(/\n{3,}/g, '\n\n').trim();

      if (result !== original) {
        transformations.push('COLLAPSE_WHITESPACE');
      }
    }

    return result;
  }

  /**
   * Normalizes code blocks preserving exact indentation, syntax, and formatting.
   */
  private normalizeCodeBlock(
    text: string,
    config: NormalizationConfig,
    transformations: string[],
  ): string {
    let result = text;

    // Line endings
    if (config.normalizeLineEndings && (result.includes('\r\n') || result.includes('\r'))) {
      result = result.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      transformations.push('NORMALIZE_LINE_ENDINGS');
    }

    // Control characters (preserving tabs and newlines)
    if (config.stripControlChars && CONTROL_CHARS_REGEX.test(result)) {
      result = result.replace(CONTROL_CHARS_REGEX, '');
      transformations.push('STRIP_CONTROL_CHARS');
    }

    // Unicode normalization
    if (config.unicodePolicy !== 'NONE') {
      const normalized = result.normalize(config.unicodePolicy);
      if (normalized !== result) {
        result = normalized;
        transformations.push(`UNICODE_${config.unicodePolicy}`);
      }
    }

    // NOTE: Indentation and spaces are strictly preserved for code blocks!
    return result;
  }

  /**
   * Normalizes table blocks preserving markdown table structure and row alignment.
   */
  private normalizeTable(
    text: string,
    config: NormalizationConfig,
    transformations: string[],
  ): string {
    let result = text;

    if (config.normalizeLineEndings && (result.includes('\r\n') || result.includes('\r'))) {
      result = result.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      transformations.push('NORMALIZE_LINE_ENDINGS');
    }

    if (config.stripControlChars && CONTROL_CHARS_REGEX.test(result)) {
      result = result.replace(CONTROL_CHARS_REGEX, '');
      transformations.push('STRIP_CONTROL_CHARS');
    }

    if (config.unicodePolicy !== 'NONE') {
      const normalized = result.normalize(config.unicodePolicy);
      if (normalized !== result) {
        result = normalized;
        transformations.push(`UNICODE_${config.unicodePolicy}`);
      }
    }

    // Normalize whitespace inside cells while keeping row structure intact
    if (config.collapseWhitespace) {
      result = result
        .split('\n')
        .map((row) => {
          if (!row.includes('|')) return row.trim();
          const cells = row.split('|');
          return cells.map((cell) => cell.replace(/[ \t]+/g, ' ').trim()).join(' | ');
        })
        .join('\n')
        .trim();
      transformations.push('NORMALIZE_TABLE_CELLS');
    }

    return result;
  }

  /**
   * Detects repetitive running headers or footers across multi-page documents.
   */
  private detectHeaderFooterArtifacts(blocks: readonly ExtractedBlock[]): Set<string> {
    const artifactIds = new Set<string>();

    // Only apply to documents with multi-page structure
    const pageMap = new Map<number, ExtractedBlock[]>();
    for (const b of blocks) {
      if (b.pageNumber !== null && b.type === ExtractedBlockType.PARAGRAPH) {
        const list = pageMap.get(b.pageNumber) ?? [];
        list.push(b);
        pageMap.set(b.pageNumber, list);
      }
    }

    if (pageMap.size < 2) {
      return artifactIds;
    }

    // Collect first and last paragraph of each page
    const edgeCandidates: { blockId: string; text: string; page: number }[] = [];
    for (const [page, pageBlocks] of pageMap.entries()) {
      const first = pageBlocks[0];
      const last = pageBlocks[pageBlocks.length - 1];

      if (first && first.text.length < 80) {
        edgeCandidates.push({ blockId: first.id, text: first.text.trim().toLowerCase(), page });
      }
      if (last && last.id !== first?.id && last.text.length < 80) {
        edgeCandidates.push({ blockId: last.id, text: last.text.trim().toLowerCase(), page });
      }
    }

    // Find strings that appear on multiple distinct pages at edges
    const textPageCounts = new Map<string, Set<number>>();
    for (const candidate of edgeCandidates) {
      const pages = textPageCounts.get(candidate.text) ?? new Set<number>();
      pages.add(candidate.page);
      textPageCounts.set(candidate.text, pages);
    }

    for (const candidate of edgeCandidates) {
      const distinctPages = textPageCounts.get(candidate.text)?.size ?? 0;
      // Appears on 2+ distinct pages and matches pagination or running header patterns
      if (distinctPages >= 2 || /^p[aá]gina\s+\d+(\s+de\s+\d+)?$/i.test(candidate.text)) {
        artifactIds.add(candidate.blockId);
      }
    }

    return artifactIds;
  }
}
