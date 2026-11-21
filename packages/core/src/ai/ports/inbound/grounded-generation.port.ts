import { RAGConstructedContext } from '../../domain/models/rag-constructed-context.model';
import { ChatMessage } from '../../domain/value-objects/chat-message.vo';
import { StructuredGenerationResult } from '../../domain/models/structured-generation-result.model';

export const GROUNDED_GENERATION_PORT = Symbol('IGroundedGenerationPort');

export interface GenerateGroundedPromptCommand {
  readonly query: string;
  readonly constructedContext: RAGConstructedContext;
  readonly conversationHistory?: readonly ChatMessage[];
  readonly language?: 'es' | 'en' | 'auto';
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly signal?: AbortSignal;
}

export interface IGroundedGenerationPort {
  generateGroundedAnswer(
    command: GenerateGroundedPromptCommand,
  ): Promise<StructuredGenerationResult>;
}
