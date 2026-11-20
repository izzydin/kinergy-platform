import { ExtractedBlockType } from '../enums/extracted-block-type.enum';
import { SourceLocation } from '../value-objects/source-location.vo';
import { TableBlockMetadata } from './extracted-block.model';
import { DetectedLanguageResult } from '../value-objects/detected-language.vo';
import { DocumentValidationException } from '../exceptions/knowledge-document.exceptions';

export interface CreateNormalizedBlockProps {
  readonly id?: string;
  readonly sourceBlockId: string;
  readonly type: ExtractedBlockType;
  readonly text: string;
  readonly originalLength: number;
  readonly sequence: number;
  readonly headingLevel?: number | null;
  readonly sectionPath?: readonly string[];
  readonly pageNumber?: number | null;
  readonly location?: SourceLocation | null;
  readonly tableMetadata?: TableBlockMetadata | null;
  readonly codeLanguage?: string | null;
  readonly detectedLanguage?: DetectedLanguageResult | null;
  readonly transformationsApplied?: readonly string[];
  readonly isHeaderOrFooterArtifact?: boolean;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Domain Model representing an individual normalized structural block with full source provenance.
 * Preserves the exact link to its originating ExtractedBlock, tracks length transformations,
 * and maintains structural hierarchy and semantic metadata.
 */
export class NormalizedBlock {
  public readonly id: string;
  public readonly sourceBlockId: string;
  public readonly type: ExtractedBlockType;
  public readonly text: string;
  public readonly originalLength: number;
  public readonly normalizedLength: number;
  public readonly sequence: number;
  public readonly headingLevel: number | null;
  public readonly sectionPath: readonly string[];
  public readonly pageNumber: number | null;
  public readonly location: SourceLocation | null;
  public readonly tableMetadata: TableBlockMetadata | null;
  public readonly codeLanguage: string | null;
  public readonly detectedLanguage: DetectedLanguageResult | null;
  public readonly transformationsApplied: readonly string[];
  public readonly isHeaderOrFooterArtifact: boolean;
  public readonly metadata: Readonly<Record<string, unknown>>;

  private constructor(props: {
    id: string;
    sourceBlockId: string;
    type: ExtractedBlockType;
    text: string;
    originalLength: number;
    normalizedLength: number;
    sequence: number;
    headingLevel: number | null;
    sectionPath: readonly string[];
    pageNumber: number | null;
    location: SourceLocation | null;
    tableMetadata: TableBlockMetadata | null;
    codeLanguage: string | null;
    detectedLanguage: DetectedLanguageResult | null;
    transformationsApplied: readonly string[];
    isHeaderOrFooterArtifact: boolean;
    metadata: Record<string, unknown>;
  }) {
    this.id = props.id;
    this.sourceBlockId = props.sourceBlockId;
    this.type = props.type;
    this.text = props.text;
    this.originalLength = props.originalLength;
    this.normalizedLength = props.normalizedLength;
    this.sequence = props.sequence;
    this.headingLevel = props.headingLevel;
    this.sectionPath = Object.freeze([...props.sectionPath]);
    this.pageNumber = props.pageNumber;
    this.location = props.location;
    this.tableMetadata = props.tableMetadata;
    this.codeLanguage = props.codeLanguage;
    this.detectedLanguage = props.detectedLanguage;
    this.transformationsApplied = Object.freeze([...props.transformationsApplied]);
    this.isHeaderOrFooterArtifact = props.isHeaderOrFooterArtifact;
    this.metadata = Object.freeze({ ...props.metadata });
    Object.freeze(this);
  }

  public static create(props: CreateNormalizedBlockProps): NormalizedBlock {
    if (!props.sourceBlockId || props.sourceBlockId.trim() === '') {
      throw new DocumentValidationException(
        'NormalizedBlock requires a valid non-empty sourceBlockId.',
      );
    }
    if (!props.type || !Object.values(ExtractedBlockType).includes(props.type)) {
      throw new DocumentValidationException(
        `Invalid or unsupported ExtractedBlockType: '${props.type}'`,
      );
    }
    if (typeof props.sequence !== 'number' || props.sequence < 0) {
      throw new DocumentValidationException(
        'NormalizedBlock sequence must be a non-negative integer.',
      );
    }
    if (props.originalLength < 0) {
      throw new DocumentValidationException('NormalizedBlock originalLength cannot be negative.');
    }

    if (props.type === ExtractedBlockType.HEADING) {
      if (
        props.headingLevel === null ||
        props.headingLevel === undefined ||
        props.headingLevel < 1 ||
        props.headingLevel > 6
      ) {
        throw new DocumentValidationException(
          `HEADING blocks must declare a headingLevel between 1 and 6, received '${props.headingLevel}'`,
        );
      }
    }

    const text = props.text ?? '';

    const id =
      props.id && props.id.trim() !== ''
        ? props.id.trim()
        : typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID
          ? globalThis.crypto.randomUUID()
          : `norm_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    return new NormalizedBlock({
      id,
      sourceBlockId: props.sourceBlockId.trim(),
      type: props.type,
      text,
      originalLength: props.originalLength,
      normalizedLength: text.length,
      sequence: props.sequence,
      headingLevel: props.type === ExtractedBlockType.HEADING ? (props.headingLevel ?? 1) : null,
      sectionPath: props.sectionPath ?? [],
      pageNumber: props.pageNumber ?? null,
      location: props.location ?? null,
      tableMetadata: props.tableMetadata ?? null,
      codeLanguage: props.codeLanguage ?? null,
      detectedLanguage: props.detectedLanguage ?? null,
      transformationsApplied: props.transformationsApplied ?? [],
      isHeaderOrFooterArtifact: props.isHeaderOrFooterArtifact ?? false,
      metadata: props.metadata ?? {},
    });
  }

  public isHeading(): boolean {
    return this.type === ExtractedBlockType.HEADING;
  }

  public isTable(): boolean {
    return this.type === ExtractedBlockType.TABLE;
  }

  public isCode(): boolean {
    return this.type === ExtractedBlockType.CODE_BLOCK;
  }

  public get charCount(): number {
    return this.normalizedLength;
  }
}
