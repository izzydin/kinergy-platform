import { ExtractedBlockType } from '../enums/extracted-block-type.enum';
import { SourceLocation, SourceLocationProps } from '../value-objects/source-location.vo';
import { DocumentValidationException } from '../exceptions/knowledge-document.exceptions';

export interface TableBlockMetadata {
  readonly rowCount: number;
  readonly colCount: number;
  readonly headers?: readonly string[];
}

export interface CreateExtractedBlockProps {
  id?: string;
  type: ExtractedBlockType;
  text: string;
  sequence: number;
  headingLevel?: number | null;
  sectionPath?: readonly string[];
  pageNumber?: number | null;
  location?: SourceLocation | SourceLocationProps | null;
  tableMetadata?: TableBlockMetadata | null;
  codeLanguage?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Domain model representing an individual structural element extracted from a document.
 * Preserves structural semantic role (heading, paragraph, list item, table, code fence),
 * strictly monotonic sequence ordering, and physical/logical source provenance.
 */
export class ExtractedBlock {
  public readonly id: string;
  public readonly type: ExtractedBlockType;
  public readonly text: string;
  public readonly sequence: number;
  public readonly headingLevel: number | null;
  public readonly sectionPath: readonly string[];
  public readonly pageNumber: number | null;
  public readonly location: SourceLocation | null;
  public readonly tableMetadata: TableBlockMetadata | null;
  public readonly codeLanguage: string | null;
  public readonly metadata: Readonly<Record<string, unknown>>;

  private constructor(props: {
    id: string;
    type: ExtractedBlockType;
    text: string;
    sequence: number;
    headingLevel: number | null;
    sectionPath: readonly string[];
    pageNumber: number | null;
    location: SourceLocation | null;
    tableMetadata: TableBlockMetadata | null;
    codeLanguage: string | null;
    metadata: Record<string, unknown>;
  }) {
    this.id = props.id;
    this.type = props.type;
    this.text = props.text;
    this.sequence = props.sequence;
    this.headingLevel = props.headingLevel;
    this.sectionPath = Object.freeze([...props.sectionPath]);
    this.pageNumber = props.pageNumber;
    this.location = props.location;
    this.tableMetadata = props.tableMetadata ? Object.freeze({ ...props.tableMetadata }) : null;
    this.codeLanguage = props.codeLanguage;
    this.metadata = Object.freeze({ ...props.metadata });
    Object.freeze(this);
  }

  public static create(props: CreateExtractedBlockProps): ExtractedBlock {
    if (!props.type || !Object.values(ExtractedBlockType).includes(props.type)) {
      throw new DocumentValidationException(
        `Invalid or missing ExtractedBlockType: '${props.type}'`,
      );
    }

    if (
      typeof props.sequence !== 'number' ||
      !Number.isInteger(props.sequence) ||
      props.sequence < 0
    ) {
      throw new DocumentValidationException(
        `Block sequence must be a non-negative integer, received: ${props.sequence}`,
      );
    }

    let headingLevel: number | null = null;
    if (props.type === ExtractedBlockType.HEADING) {
      if (
        props.headingLevel === undefined ||
        props.headingLevel === null ||
        !Number.isInteger(props.headingLevel) ||
        props.headingLevel < 1 ||
        props.headingLevel > 6
      ) {
        throw new DocumentValidationException(
          `Heading block must have a headingLevel integer between 1 and 6, received: ${props.headingLevel}`,
        );
      }
      headingLevel = props.headingLevel;
    } else if (props.headingLevel !== undefined && props.headingLevel !== null) {
      throw new DocumentValidationException(
        `Non-heading block type '${props.type}' cannot specify a headingLevel.`,
      );
    }

    const pageNumber = props.pageNumber !== undefined ? props.pageNumber : null;
    if (pageNumber !== null && (!Number.isInteger(pageNumber) || pageNumber < 1)) {
      throw new DocumentValidationException(
        `Block pageNumber must be a positive integer >= 1, received: ${pageNumber}`,
      );
    }

    let location: SourceLocation | null = null;
    if (props.location) {
      location =
        props.location instanceof SourceLocation
          ? props.location
          : SourceLocation.create(props.location);
    }

    const id =
      props.id && props.id.trim() !== ''
        ? props.id.trim()
        : typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID
          ? globalThis.crypto.randomUUID()
          : `blk_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    return new ExtractedBlock({
      id,
      type: props.type,
      text: props.text !== undefined && props.text !== null ? String(props.text) : '',
      sequence: props.sequence,
      headingLevel,
      sectionPath: props.sectionPath ? [...props.sectionPath] : [],
      pageNumber,
      location,
      tableMetadata: props.tableMetadata ?? null,
      codeLanguage: props.codeLanguage?.trim() || null,
      metadata: props.metadata ?? {},
    });
  }

  public get charCount(): number {
    return this.text.length;
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
}
