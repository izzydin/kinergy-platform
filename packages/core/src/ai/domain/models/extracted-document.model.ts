import { DocumentFormat } from '../enums/document-format.enum';
import { ExtractedBlock } from './extracted-block.model';
import { ExtractedBlockType } from '../enums/extracted-block-type.enum';
import { DocumentValidationException } from '../exceptions/knowledge-document.exceptions';
import { EmptyExtractedDocumentException } from '../exceptions/document-extraction.exceptions';

export interface ExtractedDocumentMetadata {
  readonly parserName: string;
  readonly parserVersion?: string;
  readonly pageCount?: number | null;
  readonly totalChars?: number;
  readonly warningCount?: number;
  readonly warnings?: readonly string[];
  readonly custom?: Record<string, unknown>;
}

export interface CreateExtractedDocumentProps {
  documentId: string;
  documentVersionId: string;
  sourceFormat: DocumentFormat;
  title?: string | null;
  languageHint?: string | null;
  blocks: ExtractedBlock[];
  metadata?: ExtractedDocumentMetadata;
  extractedAt?: Date;
}

/**
 * Domain Aggregate / Model representing the full structured extraction result of an immutable document version.
 * Enforces strictly monotonic block sequencing, format-specific provenance constraints
 * (e.g. no fabricated page numbers for Markdown/TXT), and non-empty extraction invariants.
 */
export class ExtractedDocument {
  public readonly documentId: string;
  public readonly documentVersionId: string;
  public readonly sourceFormat: DocumentFormat;
  public readonly title: string | null;
  public readonly languageHint: string;
  public readonly blocks: readonly ExtractedBlock[];
  public readonly metadata: Readonly<ExtractedDocumentMetadata>;
  public readonly extractedAt: Date;

  private constructor(props: {
    documentId: string;
    documentVersionId: string;
    sourceFormat: DocumentFormat;
    title: string | null;
    languageHint: string;
    blocks: readonly ExtractedBlock[];
    metadata: ExtractedDocumentMetadata;
    extractedAt: Date;
  }) {
    this.documentId = props.documentId;
    this.documentVersionId = props.documentVersionId;
    this.sourceFormat = props.sourceFormat;
    this.title = props.title;
    this.languageHint = props.languageHint;
    this.blocks = Object.freeze([...props.blocks]);
    this.metadata = Object.freeze({ ...props.metadata });
    this.extractedAt = new Date(props.extractedAt.getTime());
    Object.freeze(this);
  }

  public static create(props: CreateExtractedDocumentProps): ExtractedDocument {
    if (!props.documentId || props.documentId.trim() === '') {
      throw new DocumentValidationException('ExtractedDocument requires a non-empty documentId.');
    }
    if (!props.documentVersionId || props.documentVersionId.trim() === '') {
      throw new DocumentValidationException(
        'ExtractedDocument requires a non-empty documentVersionId.',
      );
    }
    if (!props.sourceFormat || !Object.values(DocumentFormat).includes(props.sourceFormat)) {
      throw new DocumentValidationException(
        `Invalid or unsupported sourceFormat: '${props.sourceFormat}'`,
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
        totalBlocks: props.blocks.length,
        reason: 'All extracted blocks contain empty or whitespace-only text.',
      });
    }

    // Invariant: Verify strictly monotonic block sequence ordering
    for (let i = 0; i < props.blocks.length; i++) {
      const current = props.blocks[i];
      if (!current) continue;

      if (i > 0) {
        const previous = props.blocks[i - 1];
        if (previous && current.sequence <= previous.sequence) {
          throw new DocumentValidationException(
            `Extracted blocks must preserve strictly increasing sequence ordering. Block at index ${i} has sequence ${current.sequence} <= previous sequence ${previous.sequence}.`,
          );
        }
      }

      // Invariant: For unpaginated formats (Markdown, TXT), reject fabricated page numbers
      const isUnpaginatedFormat =
        props.sourceFormat === DocumentFormat.MARKDOWN || props.sourceFormat === DocumentFormat.TXT;

      if (isUnpaginatedFormat && current.pageNumber !== null && current.pageNumber !== undefined) {
        throw new DocumentValidationException(
          `Fabricated page number '${current.pageNumber}' detected for unpaginated format '${props.sourceFormat}'. Unpaginated documents must use null pageNumber.`,
        );
      }
    }

    const defaultMetadata: ExtractedDocumentMetadata = {
      parserName: 'unknown-parser',
      totalChars: props.blocks.reduce((acc, b) => acc + b.charCount, 0),
    };

    return new ExtractedDocument({
      documentId: props.documentId.trim(),
      documentVersionId: props.documentVersionId.trim(),
      sourceFormat: props.sourceFormat,
      title: props.title?.trim() || null,
      languageHint: (props.languageHint || 'es').toLowerCase().trim(),
      blocks: props.blocks,
      metadata: props.metadata ?? defaultMetadata,
      extractedAt: props.extractedAt ? new Date(props.extractedAt.getTime()) : new Date(),
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

  public getHeadingBlocks(): ExtractedBlock[] {
    return this.blocks.filter((b) => b.isHeading());
  }

  public getBlocksByType(type: ExtractedBlockType): ExtractedBlock[] {
    return this.blocks.filter((b) => b.type === type);
  }

  public getBlocksForPage(pageNumber: number): ExtractedBlock[] {
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
