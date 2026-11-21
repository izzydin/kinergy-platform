import { RAGSourceCitation } from '../value-objects/rag-source-citation.vo';
import { ClaimAttribution } from './claim-attribution.model';

export interface CreateCitationValidationResultProps {
  isValid: boolean;
  isGrounded: boolean;
  verifiedCitations: readonly RAGSourceCitation[];
  unverifiedChunkIds: readonly string[];
  claims: readonly ClaimAttribution[];
  adjustedAnswer: string;
  abstentionReason?: string | null;
  inconsistencies: readonly string[];
}

/**
 * Domain Aggregate / Model encapsulating the authoritative evaluation of response citations,
 * claim-level attributions, and groundedness integrity.
 */
export class CitationValidationResult {
  public readonly isValid: boolean;
  public readonly isGrounded: boolean;
  public readonly verifiedCitations: readonly RAGSourceCitation[];
  public readonly unverifiedChunkIds: readonly string[];
  public readonly claims: readonly ClaimAttribution[];
  public readonly adjustedAnswer: string;
  public readonly abstentionReason?: string | null;
  public readonly inconsistencies: readonly string[];

  private constructor(props: CreateCitationValidationResultProps) {
    this.isValid = props.isValid;
    this.isGrounded = props.isGrounded;
    this.verifiedCitations = Object.freeze([...props.verifiedCitations]);
    this.unverifiedChunkIds = Object.freeze([...props.unverifiedChunkIds]);
    this.claims = Object.freeze([...props.claims]);
    this.adjustedAnswer = props.adjustedAnswer;
    this.abstentionReason = props.abstentionReason;
    this.inconsistencies = Object.freeze([...props.inconsistencies]);
    Object.freeze(this);
  }

  public static create(props: CreateCitationValidationResultProps): CitationValidationResult {
    return new CitationValidationResult(props);
  }
}
