export interface CreateStructuredGenerationResultProps {
  rawText: string;
  answer: string;
  grounded: boolean;
  citedChunkIds: readonly string[];
  unverifiedChunkIds?: readonly string[];
  abstentionReason?: string | null;
  confidence: 'high' | 'medium' | 'low';
  modelIdentifier: string;
  promptTokens: number;
  completionTokens: number;
  promptVersion: string;
  finishReason: 'stop' | 'length' | 'cancelled';
}

/**
 * Domain Model encapsulating the structured, validated outcome of an LLM generation.
 * Distinguishes verified citation chunk IDs from unverified/hallucinated IDs.
 */
export class StructuredGenerationResult {
  public readonly rawText: string;
  public readonly answer: string;
  public readonly grounded: boolean;
  public readonly citedChunkIds: readonly string[];
  public readonly unverifiedChunkIds: readonly string[];
  public readonly abstentionReason?: string | null;
  public readonly confidence: 'high' | 'medium' | 'low';
  public readonly modelIdentifier: string;
  public readonly promptTokens: number;
  public readonly completionTokens: number;
  public readonly promptVersion: string;
  public readonly finishReason: 'stop' | 'length' | 'cancelled';

  private constructor(props: CreateStructuredGenerationResultProps) {
    this.rawText = props.rawText;
    this.answer = props.answer;
    this.grounded = props.grounded;
    this.citedChunkIds = Object.freeze([...props.citedChunkIds]);
    this.unverifiedChunkIds = Object.freeze([...(props.unverifiedChunkIds ?? [])]);
    this.abstentionReason = props.abstentionReason;
    this.confidence = props.confidence;
    this.modelIdentifier = props.modelIdentifier;
    this.promptTokens = Math.max(0, props.promptTokens);
    this.completionTokens = Math.max(0, props.completionTokens);
    this.promptVersion = props.promptVersion;
    this.finishReason = props.finishReason;
    Object.freeze(this);
  }

  public static create(props: CreateStructuredGenerationResultProps): StructuredGenerationResult {
    return new StructuredGenerationResult(props);
  }

  /**
   * Safe fallback factory for malformed or unparseable model responses.
   */
  public static malformed(
    rawText: string,
    model: string,
    promptVersion: string,
    reason = 'No se pudo generar una respuesta verificada debido a un formato no estructurado en la salida del modelo.',
  ): StructuredGenerationResult {
    return new StructuredGenerationResult({
      rawText,
      answer: reason,
      grounded: false,
      citedChunkIds: Object.freeze([]),
      unverifiedChunkIds: Object.freeze([]),
      abstentionReason: 'MALFORMED_OUTPUT',
      confidence: 'low',
      modelIdentifier: model,
      promptTokens: 0,
      completionTokens: 0,
      promptVersion,
      finishReason: 'stop',
    });
  }
}
