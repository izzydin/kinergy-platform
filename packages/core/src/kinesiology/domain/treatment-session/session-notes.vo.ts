import { ValueObject } from '../shared/value-object';

export interface SessionNotesProps {
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  rawText?: string;
}

export const MAX_NOTE_SECTION_LENGTH = 10000;
export const MAX_TOTAL_NOTE_LENGTH = 50000;

/**
 * Value Object representing structured clinical SOAP notes or free-text observations
 * recorded during a kinesiology treatment session.
 */
export class SessionNotes implements ValueObject<SessionNotesProps> {
  private readonly subjective?: string;
  private readonly objective?: string;
  private readonly assessment?: string;
  private readonly plan?: string;
  private readonly rawText?: string;

  private constructor(props: SessionNotesProps) {
    this.subjective = SessionNotes.normalizeText(props.subjective, 'Subjective');
    this.objective = SessionNotes.normalizeText(props.objective, 'Objective');
    this.assessment = SessionNotes.normalizeText(props.assessment, 'Assessment');
    this.plan = SessionNotes.normalizeText(props.plan, 'Plan');
    this.rawText = SessionNotes.normalizeText(props.rawText, 'RawText');

    const totalLength =
      (this.subjective?.length ?? 0) +
      (this.objective?.length ?? 0) +
      (this.assessment?.length ?? 0) +
      (this.plan?.length ?? 0) +
      (this.rawText?.length ?? 0);

    if (totalLength > MAX_TOTAL_NOTE_LENGTH) {
      throw new Error(
        `Total session notes length cannot exceed ${MAX_TOTAL_NOTE_LENGTH} characters.`,
      );
    }

    Object.freeze(this);
  }

  private static normalizeText(value: string | undefined, fieldName: string): string | undefined {
    if (!value) return undefined;
    const trimmed = value.replace(/\r\n/g, '\n').trim();
    if (trimmed.length === 0) return undefined;
    if (trimmed.length > MAX_NOTE_SECTION_LENGTH) {
      throw new Error(
        `${fieldName} note section cannot exceed ${MAX_NOTE_SECTION_LENGTH} characters.`,
      );
    }
    return trimmed;
  }

  /**
   * Factory method to create a SessionNotes value object.
   * Supports either structured SOAP props or a single raw text string.
   */
  public static create(input?: SessionNotesProps | string): SessionNotes {
    if (!input) {
      return new SessionNotes({});
    }
    if (typeof input === 'string') {
      return new SessionNotes({ rawText: input });
    }
    return new SessionNotes(input);
  }

  /**
   * Returns an empty SessionNotes instance.
   */
  public static empty(): SessionNotes {
    return new SessionNotes({});
  }

  public getSubjective(): string | undefined {
    return this.subjective;
  }

  public getObjective(): string | undefined {
    return this.objective;
  }

  public getAssessment(): string | undefined {
    return this.assessment;
  }

  public getPlan(): string | undefined {
    return this.plan;
  }

  public getRawText(): string | undefined {
    return this.rawText;
  }

  /**
   * Returns true if any clinical note field is populated.
   */
  public hasContent(): boolean {
    return !!(this.subjective || this.objective || this.assessment || this.plan || this.rawText);
  }

  public getValue(): SessionNotesProps {
    return {
      subjective: this.subjective,
      objective: this.objective,
      assessment: this.assessment,
      plan: this.plan,
      rawText: this.rawText,
    };
  }

  public equals(other: ValueObject<SessionNotesProps>): boolean {
    if (!other || !(other instanceof SessionNotes)) {
      return false;
    }
    const otherVal = other.getValue();
    return (
      this.subjective === otherVal.subjective &&
      this.objective === otherVal.objective &&
      this.assessment === otherVal.assessment &&
      this.plan === otherVal.plan &&
      this.rawText === otherVal.rawText
    );
  }

  public toString(): string {
    const parts: string[] = [];
    if (this.subjective) parts.push(`S: ${this.subjective}`);
    if (this.objective) parts.push(`O: ${this.objective}`);
    if (this.assessment) parts.push(`A: ${this.assessment}`);
    if (this.plan) parts.push(`P: ${this.plan}`);
    if (this.rawText) parts.push(`Notes: ${this.rawText}`);
    return parts.join(' | ');
  }
}
