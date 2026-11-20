export const TOKENIZER_PORT = Symbol('TOKENIZER_PORT');

/**
 * Result of counting tokens in a text fragment.
 */
export interface TokenCountResult {
  readonly tokenCount: number;
  readonly characterCount: number;
  readonly isTruncated: boolean;
}

/**
 * Outbound port contract for deterministic tokenization and token counting.
 * Decouples structure-aware chunking and embedding validation from concrete
 * tokenization libraries (tiktoken, HuggingFace transformers, etc.).
 * Operates purely in-process without network overhead or runtime Ollama requirements.
 */
export interface ITokenizerPort {
  /**
   * Model or encoding vocabulary this tokenizer targets (e.g. 'bge-m3-xlm-roberta', 'cl100k_base').
   */
  readonly modelName: string;

  /**
   * Tokenizer implementation version for provenance tracking.
   */
  readonly tokenizerVersion: string;

  /**
   * Maximum context window supported by the target model in tokens (e.g. 8,192 for BGE-M3).
   */
  readonly maxContextLimit: number;

  /**
   * Counts tokens in a plain text string deterministically.
   */
  countTokens(text: string): number;

  /**
   * Encodes a string into an array of integer token IDs.
   */
  encode(text: string): number[];

  /**
   * Decodes an array of integer token IDs back into a string.
   */
  decode(tokens: readonly number[]): string;

  /**
   * Truncates text so that its token count does not exceed the specified maximum.
   */
  truncateToMaxTokens(text: string, maxTokens: number): string;
}
