import { DocumentFormat } from '../enums/document-format.enum';
import { ExtractedBlockType } from '../enums/extracted-block-type.enum';
import { NormalizedBlock } from './normalized-block.model';
import { DetectedLanguageResult } from '../value-objects/detected-language.vo';
import { NormalizationConfig } from '../value-objects/normalization-config.vo';
import { EmptyExtractedDocumentException } from '../exceptions/document-extraction.exceptions';
import { DocumentValidationException } from '../exceptions/knowledge-document.exceptions';

export interface NormalizedDocumentMetadata {
  readonly normalizerName: string;
  readonly normalizerVersion: string;
  readonly originalTotalChars: number;
  readonly normalizedTotalChars: number;
  readonly pageCount: number | null;
  readonly transformationCount: number;
  readonly headerFooterArtifactsDetected?: number;
  readonly custom?: Readonly<Record<string, unknown>>;
}

export interface CreateNormalizedDocumentProps {
  readonly documentId: string;
  readonly documentVersionId: string;
  readonly sourceFormat: DocumentFormat;
  readonly title?: string | null;
  readonly documentLanguage: DetectedLanguageResult;
  readonly blocks: readonly NormalizedBlock[];
  readonly normalizationConfig?: NormalizationConfig;
  readonly metadata?: NormalizedDocumentMetadata;
  readonly normalizedAt?: Date;
}

/**
 * Domain Aggregate / Model representing the fully normalized, structured content of an immutable document version.
 * Preserves structural hierarchy, complete block traceability, and versioned normalization provenance.
 */
export class NormalizedDocument {
  public readonly documentId: string;
  public readonly documentVersionId: string;
  public readonly sourceFormat: DocumentFormat;
  public readonly title: string | null;
  public readonly documentLanguage: DetectedLanguageResult;
  public readonly blocks: readonly NormalizedBlock[];
  public readonly normalizationConfig: NormalizationConfig;
  public readonly metadata: Readonly<NormalizedDocumentMetadata>;
  public readonly normalizedAt: Date;

  private constructor(props: {
    documentId: string;
    documentVersionId: string;
    sourceFormat: DocumentFormat;
    title: string | null;
    documentLanguage: DetectedLanguageResult;
    blocks: readonly NormalizedBlock[];
    normalizationConfig: NormalizationConfig;
    metadata: NormalizedDocumentMetadata;
    normalizedAt: Date;
  }) {
    this.documentId = props.documentId;
    this.documentVersionId = props.documentVersionId;
    this.sourceFormat = props.sourceFormat;
    this.title = props.title;
    this.documentLanguage = props.documentLanguage;
    this.blocks = Object.freeze([...props.blocks]);
    this.normalizationConfig = props.normalizationConfig;
    this.metadata = Object.freeze({ ...props.metadata });
    this.normalizedAt = new Date(props.normalizedAt.getTime());
    Object.freeze(this);
  }

  public static create(props: CreateNormalizedDocumentProps): NormalizedDocument {
    if (!props.documentId || props.documentId.trim() === '') {
      throw new DocumentValidationException('NormalizedDocument requires a non-empty documentId.');
    }
    if (!props.documentVersionId || props.documentVersionId.trim() === '') {
      throw new DocumentValidationException(
        'NormalizedDocument requires a non-empty documentVersionId.',
      );
    }
    if (!props.sourceFormat || !Object.values(DocumentFormat).includes(props.sourceFormat)) {
      throw new DocumentValidationException(
        `Invalid or unsupported sourceFormat: '${props.sourceFormat}'`,
      );
    }
    if (!props.documentLanguage) {
      throw new DocumentValidationException(
        'NormalizedDocument requires a valid documentLanguage result.',
      );
    }
    if (!props.blocks || !Array.isArray(props.blocks) || props.blocks.length === 0) {
      throw new EmptyExtractedDocumentException(props.documentId, props.documentVersionId);
    }

    // Invariant: Verify blocks are not all empty/whitespace
    const hasMeaningfulText = props.blocks.some(
      (b) => b.text && b.text.trim().length > 0 && b.type !== ExtractedBlockType.PAGE_BOUNDARY,
    );
    if (!hasMeaningfulText) {
      throw new EmptyExtractedDocumentException(props.documentId, props.documentVersionId, {
        reason: 'NormalizedDocument yielded zero meaningful textual content across all blocks.',
      });
    }

    // Invariant: Strictly monotonic sequence verification
    for (let i = 0; i < props.blocks.length; i++) {
      const current = props.blocks[i];
      if (!current) continue;

      if (current.sequence !== i) {
        throw new DocumentValidationException(
          `NormalizedBlock sequences must be strictly monotonic starting from 0. Block at index ${i} has sequence ${current.sequence}`,
        );
      }
    }

    const originalTotalChars = props.blocks.reduce((acc, b) => acc + b.originalLength, 0);
    const normalizedTotalChars = props.blocks.reduce((acc, b) => acc + b.normalizedLength, 0);

    const defaultMetadata: NormalizedDocumentMetadata = {
      normalizerName: 'deterministic-document-normalizer',
      normalizerVersion: '1.0.0',
      originalTotalChars,
      normalizedTotalChars,
      pageCount: null,
      transformationCount: props.blocks.reduce(
        (acc, b) => acc + b.transformationsApplied.length,
        0,
      ),
    };

    return new NormalizedDocument({
      documentId: props.documentId.trim(),
      documentVersionId: props.documentVersionId.trim(),
      sourceFormat: props.sourceFormat,
      title: props.title?.trim() || null,
      documentLanguage: props.documentLanguage,
      blocks: props.blocks,
      normalizationConfig: props.normalizationConfig ?? NormalizationConfig.default(),
      metadata: props.metadata ?? defaultMetadata,
      normalizedAt: props.normalizedAt ? new Date(props.normalizedAt.getTime()) : new Date(),
    });
  }

  public get blockCount(): number {
    return this.blocks.length;
  }

  public get totalCharacters(): number {
    return this.blocks.reduce((acc, b) => acc + b.charCount, 0);
  }

  public get pageCount(): number {
    if (this.sourceFormat === DocumentFormat.MARKDOWN || this.sourceFormat === DocumentFormat.TXT) {
      return 0;
    }
    const pages = new Set<number>();
    for (const block of this.blocks) {
      if (block.pageNumber !== null) {
        pages.add(block.pageNumber);
      }
    }
    return pages.size;
  }

  public getHeadings(): NormalizedBlock[] {
    return this.blocks.filter((b) => b.isHeading());
  }

  public getBlocksByType(type: ExtractedBlockType): NormalizedBlock[] {
    return this.blocks.filter((b) => b.type === type);
  }

  public getBlocksForPage(pageNumber: number): NormalizedBlock[] {
    return this.blocks.filter((b) => b.pageNumber === pageNumber);
  }

  public toFullPlainText(): string {
    return this.blocks
      .filter(
        (b) => b.type !== ExtractedBlockType.PAGE_BOUNDARY && b.type !== ExtractedBlockType.DIVIDER,
      )
      .map((b) => b.text)
      .join('\n\n');
  }
}
