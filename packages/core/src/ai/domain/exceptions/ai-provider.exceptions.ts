export class AiDomainException extends Error {
  public readonly code: string;

  constructor(message: string, code = 'AI_DOMAIN_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class LLMProviderUnavailableException extends AiDomainException {
  constructor(message = 'AI Assistant is temporarily unavailable.') {
    super(message, 'LLM_PROVIDER_UNAVAILABLE');
  }
}

export class EmbeddingProviderUnavailableException extends AiDomainException {
  constructor(message = 'AI Embedding service temporarily offline.') {
    super(message, 'EMBEDDING_PROVIDER_UNAVAILABLE');
  }
}

export class EmbeddingDimensionMismatchException extends AiDomainException {
  constructor(expected: number, actual: number) {
    super(
      `Embedding dimension mismatch: expected ${expected}, got ${actual}.`,
      'EMBEDDING_DIMENSION_MISMATCH',
    );
  }
}

export class GenerationFailedException extends AiDomainException {
  constructor(message = 'AI failed to generate a response.') {
    super(message, 'GENERATION_FAILED');
  }
}

export class GenerationCancelledException extends AiDomainException {
  constructor(message = 'Generation cancelled by user.') {
    super(message, 'GENERATION_CANCELLED');
  }
}

export class ModelNotFoundException extends AiDomainException {
  constructor(modelIdentifier: string) {
    super(`Model '${modelIdentifier}' was not found in the inference runtime.`, 'MODEL_NOT_FOUND');
  }
}

export class ProviderTimeoutException extends AiDomainException {
  constructor(message = 'AI provider request timed out.') {
    super(message, 'PROVIDER_TIMEOUT');
  }
}

export class AiConfigurationInvalidException extends AiDomainException {
  constructor(message = 'Internal AI subsystem config error.') {
    super(message, 'CONFIGURATION_INVALID');
  }
}

export class InputTooLargeException extends AiDomainException {
  constructor(message = 'Input payload exceeds maximum model context limit.') {
    super(message, 'INPUT_TOO_LARGE');
  }
}

export class ResourceExhaustedException extends AiDomainException {
  constructor(message = 'AI inference runtime resources exhausted.') {
    super(message, 'RESOURCE_EXHAUSTED');
  }
}

export class InvalidEmbeddingRequestException extends AiDomainException {
  constructor(message = 'Invalid embedding request payload.') {
    super(message, 'INVALID_REQUEST');
  }
}
