import { DocumentValidationException } from '../exceptions/knowledge-document.exceptions';

export interface SourceLocationProps {
  pageNumber?: number | null;
  startOffset?: number | null;
  endOffset?: number | null;
  startLine?: number | null;
  endLine?: number | null;
  sectionPath?: readonly string[];
}

/**
 * Value Object representing the precise physical or logical location
 * of an extracted element within the source document.
 * Adheres strictly to format realities: supports page numbers for paginated
 * formats (PDF) and line/character offsets for linear formats (Markdown, TXT).
 */
export class SourceLocation {
  public readonly pageNumber: number | null;
  public readonly startOffset: number | null;
  public readonly endOffset: number | null;
  public readonly startLine: number | null;
  public readonly endLine: number | null;
  public readonly sectionPath: readonly string[];

  private constructor(props: {
    pageNumber: number | null;
    startOffset: number | null;
    endOffset: number | null;
    startLine: number | null;
    endLine: number | null;
    sectionPath: readonly string[];
  }) {
    this.pageNumber = props.pageNumber;
    this.startOffset = props.startOffset;
    this.endOffset = props.endOffset;
    this.startLine = props.startLine;
    this.endLine = props.endLine;
    this.sectionPath = Object.freeze([...props.sectionPath]);
    Object.freeze(this);
  }

  public static create(props: SourceLocationProps = {}): SourceLocation {
    const pageNumber = props.pageNumber !== undefined ? props.pageNumber : null;
    if (pageNumber !== null) {
      if (!Number.isInteger(pageNumber) || pageNumber < 1) {
        throw new DocumentValidationException(
          `Page number must be a positive integer greater than or equal to 1, received: ${pageNumber}`,
        );
      }
    }

    const startOffset = props.startOffset !== undefined ? props.startOffset : null;
    const endOffset = props.endOffset !== undefined ? props.endOffset : null;

    if (startOffset !== null) {
      if (!Number.isInteger(startOffset) || startOffset < 0) {
        throw new DocumentValidationException(
          `Start offset must be a non-negative integer, received: ${startOffset}`,
        );
      }
    }

    if (endOffset !== null) {
      if (!Number.isInteger(endOffset) || endOffset < 0) {
        throw new DocumentValidationException(
          `End offset must be a non-negative integer, received: ${endOffset}`,
        );
      }
      if (startOffset !== null && endOffset < startOffset) {
        throw new DocumentValidationException(
          `End offset (${endOffset}) cannot be less than start offset (${startOffset}).`,
        );
      }
    }

    const startLine = props.startLine !== undefined ? props.startLine : null;
    const endLine = props.endLine !== undefined ? props.endLine : null;

    if (startLine !== null) {
      if (!Number.isInteger(startLine) || startLine < 1) {
        throw new DocumentValidationException(
          `Start line must be a positive integer greater than or equal to 1, received: ${startLine}`,
        );
      }
    }

    if (endLine !== null) {
      if (!Number.isInteger(endLine) || endLine < 1) {
        throw new DocumentValidationException(
          `End line must be a positive integer greater than or equal to 1, received: ${endLine}`,
        );
      }
      if (startLine !== null && endLine < startLine) {
        throw new DocumentValidationException(
          `End line (${endLine}) cannot be less than start line (${startLine}).`,
        );
      }
    }

    const sectionPath = props.sectionPath ? [...props.sectionPath] : [];

    return new SourceLocation({
      pageNumber,
      startOffset,
      endOffset,
      startLine,
      endLine,
      sectionPath,
    });
  }

  /**
   * Human-readable source descriptor (e.g. "Page 3", "Lines 45-52", "Root > Section 1").
   */
  public toReadableString(): string {
    const parts: string[] = [];
    if (this.sectionPath.length > 0) {
      parts.push(`[${this.sectionPath.join(' > ')}]`);
    }
    if (this.pageNumber !== null) {
      parts.push(`p. ${this.pageNumber}`);
    }
    if (this.startLine !== null) {
      parts.push(
        this.endLine !== null && this.endLine !== this.startLine
          ? `lines ${this.startLine}-${this.endLine}`
          : `line ${this.startLine}`,
      );
    }
    if (parts.length === 0 && this.startOffset !== null) {
      parts.push(
        this.endOffset !== null
          ? `chars ${this.startOffset}-${this.endOffset}`
          : `char ${this.startOffset}`,
      );
    }
    return parts.length > 0 ? parts.join(' ') : 'unspecified location';
  }
}
