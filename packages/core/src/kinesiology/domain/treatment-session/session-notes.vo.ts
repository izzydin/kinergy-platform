import { ValueObject } from '../shared/value-object';

export interface SessionNotesProps {
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  rawText?: string;
}

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
    this.subjective = props.subjective?.trim() || undefined;
    this.objective = props.objective?.trim() || undefined;
    this.assessment = props.assessment?.trim() || undefined;
    this.plan = props.plan?.trim() || undefined;
    this.rawText = props.rawText?.trim() || undefined;
    Object.freeze(this);
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
