import { Injectable, Inject, Optional, Logger } from '@nestjs/common';
import {
  IGroundedGenerationPort,
  GenerateGroundedPromptCommand,
  StructuredGenerationResult,
  ILLMProviderPort,
  buildRAGSystemPrompt,
  buildRAGUserPrompt,
  KINERGY_RAG_PROMPT_VERSION,
  ChatMessage,
  GenerationCancelledException,
  ModelNotFoundException,
  AiConfigurationInvalidException,
  InputTooLargeException,
} from '@kinergy-platform/core';
import { AI_CONFIG_TOKEN, AI_LLM_PROVIDER_TOKEN } from '../../ai.tokens';
import { AiConfiguration, DEFAULT_AI_CONFIG } from '../../config/ai.config';

interface RawModelPayload {
  answer?: unknown;
  grounded?: unknown;
  citedChunkIds?: unknown;
  abstentionReason?: unknown;
  confidence?: unknown;
}

/**
 * Production implementation of IGroundedGenerationPort.
 *
 * Enforces:
 * 1. Versioned system prompt integration (KINERGY_RAG_PROMPT_VERSION).
 * 2. Provider-agnostic structured JSON decoding via ILLMProviderPort.
 * 3. Strict citation validation: cross-checks cited chunk IDs against the authorized
 *    retrieval evidence pool, filtering out hallucinated citations.
 * 4. Resilient fallback for malformed or unparseable JSON outputs.
 * 5. Bounded generation parameters (temperature, maxTokens, context limits).
 */
@Injectable()
export class GroundedGenerationService implements IGroundedGenerationPort {
  private readonly logger = new Logger(GroundedGenerationService.name);
  private readonly config: AiConfiguration;

  constructor(
    @Inject(AI_LLM_PROVIDER_TOKEN)
    private readonly llmProvider: ILLMProviderPort,
    @Optional()
    @Inject(AI_CONFIG_TOKEN)
    config?: AiConfiguration,
  ) {
    this.config = { ...DEFAULT_AI_CONFIG, ...config };
  }

  public async generateGroundedAnswer(
    command: GenerateGroundedPromptCommand,
  ): Promise<StructuredGenerationResult> {
    const promptVersion = KINERGY_RAG_PROMPT_VERSION;
    const modelIdentifier = this.llmProvider.getModelIdentifier();

    // 1. Build authoritative versioned system prompt
    const systemPrompt = buildRAGSystemPrompt({ language: command.language });

    // 2. Format conversation history summary if provided
    const conversationHistorySummary = this.formatConversationHistory(
      command.conversationHistory ?? [],
    );

    // 3. Format user prompt with untrusted evidence and user question
    const userPrompt = buildRAGUserPrompt({
      query: command.query,
      formattedEvidence: command.constructedContext.formattedContext,
      conversationHistorySummary,
    });

    // 4. Resolve generation options & retry policy
    const temperature = command.temperature ?? this.config.chatTemperature ?? 0.2;
    const maxTokens = command.maxTokens ?? this.config.chatMaxTokens ?? 512;
    const maxRetries = this.config.generationMaxRetries ?? 1;
    let attempt = 0;
    let lastError: unknown = null;
    let lastRawText = '';

    while (true) {
      if (command.signal?.aborted) {
        throw new GenerationCancelledException();
      }

      try {
        // 5. Invoke LLM provider with JSON structure enforcement
        const result = await this.llmProvider.generateText(userPrompt, {
          systemPrompt,
          temperature,
          maxTokens,
          format: 'json',
          signal: command.signal,
        });

        if (!result || typeof result.text !== 'string') {
          if (lastError) {
            throw lastError;
          }
          return StructuredGenerationResult.malformed(lastRawText, modelIdentifier, promptVersion);
        }

        lastRawText = result.text;

        // 6. Parse and validate JSON structure
        const parsed = this.parseJsonPayload(result.text);
        if (!parsed) {
          if (attempt < maxRetries && !command.signal?.aborted) {
            attempt++;
            this.logger.warn(
              `Model produced unparseable JSON on attempt ${attempt}. Retrying with strict JSON enforcement...`,
            );
            await this.delay(this.config.generationRetryBaseDelayMs * attempt);
            continue;
          }
          this.logger.warn(
            `Model produced unparseable JSON output after ${attempt + 1} attempt(s): ${result.text.slice(0, 100)}...`,
          );
          return StructuredGenerationResult.malformed(result.text, modelIdentifier, promptVersion);
        }

        // 7. Validate and sanitize model output fields
        const { answer, grounded: rawGrounded, abstentionReason, confidence } = parsed;

        // 8. Citation verification: cross-check citedChunkIds against authorized includedChunks
        const authorizedChunkIds = new Set(
          command.constructedContext.includedChunks.map((c) => c.chunkId),
        );

        const candidateCitedIds = Array.isArray(parsed.citedChunkIds)
          ? parsed.citedChunkIds.filter(
              (id): id is string => typeof id === 'string' && id.trim().length > 0,
            )
          : [];

        const verifiedChunkIds = candidateCitedIds.filter((id) => authorizedChunkIds.has(id));
        const unverifiedChunkIds = candidateCitedIds.filter((id) => !authorizedChunkIds.has(id));

        if (unverifiedChunkIds.length > 0) {
          this.logger.warn(
            `Model hallucinated ${unverifiedChunkIds.length} unverified chunk ID(s): [${unverifiedChunkIds.join(', ')}]. Stripped from citations.`,
          );
        }

        // 9. Enforce groundedness invariant:
        // If no authorized evidence chunks were included or verified, answer cannot be grounded
        let finalGrounded = Boolean(rawGrounded);
        let finalAbstentionReason = abstentionReason ?? null;

        if (finalGrounded && authorizedChunkIds.size === 0) {
          finalGrounded = false;
          finalAbstentionReason = finalAbstentionReason ?? 'INSUFFICIENT_EVIDENCE';
        }

        if (finalGrounded && verifiedChunkIds.length === 0 && candidateCitedIds.length > 0) {
          // Model claimed groundedness but only cited fabricated chunks
          finalGrounded = false;
          finalAbstentionReason = 'UNVERIFIED_EVIDENCE';
        }

        return StructuredGenerationResult.create({
          rawText: result.text,
          answer,
          grounded: finalGrounded,
          citedChunkIds: verifiedChunkIds,
          unverifiedChunkIds,
          abstentionReason: finalAbstentionReason,
          confidence: confidence ?? 'medium',
          modelIdentifier,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          promptVersion,
          finishReason: result.finishReason,
        });
      } catch (error: unknown) {
        lastError = error;
        if (command.signal?.aborted || error instanceof GenerationCancelledException) {
          throw new GenerationCancelledException();
        }

        if (
          error instanceof ModelNotFoundException ||
          error instanceof AiConfigurationInvalidException ||
          error instanceof InputTooLargeException
        ) {
          throw error;
        }

        if (attempt < maxRetries) {
          attempt++;
          const delayMs = Math.min(
            this.config.generationRetryMaxDelayMs,
            this.config.generationRetryBaseDelayMs * Math.pow(2, attempt - 1),
          );
          this.logger.warn(
            `Transient generation error on attempt ${attempt}/${maxRetries + 1} (${error instanceof Error ? error.message : String(error)}). Retrying in ${delayMs}ms...`,
          );
          await this.delay(delayMs);
          continue;
        }

        this.logger.error(
          `Grounded generation error after ${attempt + 1} attempt(s): ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        throw error;
      }
    }
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Safely parses JSON output from LLM, handling markdown code fences if present.
   */
  private parseJsonPayload(rawText: string): {
    answer: string;
    grounded: boolean;
    citedChunkIds: string[];
    abstentionReason: string | null;
    confidence: 'high' | 'medium' | 'low';
  } | null {
    if (!rawText || rawText.trim().length === 0) return null;

    let cleaned = rawText.trim();

    // Strip markdown code fences if model enclosed JSON in ```json ... ```
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    }

    // Try finding outer JSON object brackets
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    try {
      const parsed = JSON.parse(cleaned) as RawModelPayload;
      if (!parsed || typeof parsed !== 'object') return null;

      if (typeof parsed.answer !== 'string') return null;

      const answer = parsed.answer.trim();
      const grounded = Boolean(parsed.grounded);
      const citedChunkIds = Array.isArray(parsed.citedChunkIds) ? parsed.citedChunkIds : [];
      const abstentionReason =
        typeof parsed.abstentionReason === 'string' ? parsed.abstentionReason : null;

      let confidence: 'high' | 'medium' | 'low' = 'medium';
      if (
        parsed.confidence === 'high' ||
        parsed.confidence === 'medium' ||
        parsed.confidence === 'low'
      ) {
        confidence = parsed.confidence;
      }

      return {
        answer,
        grounded,
        citedChunkIds: citedChunkIds.map(String),
        abstentionReason,
        confidence,
      };
    } catch {
      return null;
    }
  }

  private formatConversationHistory(history: readonly ChatMessage[]): string {
    if (!history || history.length === 0) return '';
    return history.map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n');
  }
}
