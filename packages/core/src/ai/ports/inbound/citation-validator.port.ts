import { RAGConstructedContext } from '../../domain/models/rag-constructed-context.model';
import { StructuredGenerationResult } from '../../domain/models/structured-generation-result.model';
import { CitationValidationResult } from '../../domain/models/citation-validation-result.model';

export const CITATION_VALIDATOR_PORT = Symbol('ICitationValidatorPort');

export interface ValidateCitationsCommand {
  readonly query: string;
  readonly constructedContext: RAGConstructedContext;
  readonly generationResult: StructuredGenerationResult;
  readonly requestId?: string;
  readonly correlationId?: string;
}

/**
 * Inbound port contract for claim-level citation validation and application-level groundedness verification.
 */
export interface ICitationValidatorPort {
  validateResponse(command: ValidateCitationsCommand): CitationValidationResult;
}
