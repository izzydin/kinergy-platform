import { Injectable, Logger } from '@nestjs/common';
import {
  ILLMProviderPort,
  LLMGenerationOptions,
  LLMGenerationResult,
  LLMProviderUnavailableException,
  GenerationFailedException,
  GenerationCancelledException,
  ModelNotFoundException,
  ProviderTimeoutException,
  AiConfigurationInvalidException,
} from '@kinergy-platform/core';
import { AiConfiguration, DEFAULT_AI_CONFIG } from '../../config/ai.config';

interface CircuitBreakerState {
  isOpen: boolean;
  failures: number;
  lastFailureTime: number;
}

interface OllamaGenerateResponse {
  response?: string;
  thinking?: string;
  done: boolean;
  done_reason?: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaTagModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
}

interface OllamaTagsResponse {
  models: OllamaTagModel[];
}

@Injectable()
export class OllamaLLMAdapter implements ILLMProviderPort {
  private readonly logger = new Logger(OllamaLLMAdapter.name);
  private readonly config: AiConfiguration;
  private readonly circuitBreaker: CircuitBreakerState = {
    isOpen: false,
    failures: 0,
    lastFailureTime: 0,
  };
  private readonly failureThreshold = 3;
  private readonly cooldownPeriodMs = 15000; // 15s cooldown after circuit opens
  private activeGenerations = 0;

  constructor(config?: Partial<AiConfiguration>) {
    this.config = { ...DEFAULT_AI_CONFIG, ...config };
    this.validateConfiguration();
  }

  private validateConfiguration(): void {
    if (!this.config.ollamaBaseUrl || !this.config.ollamaBaseUrl.startsWith('http')) {
      throw new AiConfigurationInvalidException(
        `Invalid Ollama base URL: ${this.config.ollamaBaseUrl}`,
      );
    }
    if (!this.config.llmModel || !this.config.llmModel.trim()) {
      throw new AiConfigurationInvalidException('LLM model identifier must not be empty.');
    }
  }

  public getModelIdentifier(): string {
    return this.config.llmModel;
  }

  public async checkHealth(): Promise<{ isHealthy: boolean; model: string; latencyMs: number }> {
    const startTime = Date.now();
    try {
      const response = await fetch(`${this.config.ollamaBaseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });

      if (!response.ok) {
        return { isHealthy: false, model: this.config.llmModel, latencyMs: Date.now() - startTime };
      }

      const data = (await response.json()) as OllamaTagsResponse;
      const modelExists = data.models?.some(
        (m) =>
          m.name === this.config.llmModel ||
          m.name.startsWith(`${this.config.llmModel}:`) ||
          m.model === this.config.llmModel,
      );

      return {
        isHealthy: Boolean(modelExists),
        model: this.config.llmModel,
        latencyMs: Date.now() - startTime,
      };
    } catch {
      return {
        isHealthy: false,
        model: this.config.llmModel,
        latencyMs: Date.now() - startTime,
      };
    }
  }

  public async generateText(
    prompt: string,
    options?: LLMGenerationOptions,
  ): Promise<LLMGenerationResult> {
    this.assertCircuitClosed();

    if (this.activeGenerations >= this.config.chatMaxConcurrent) {
      throw new LLMProviderUnavailableException(
        'AI generation capacity saturated. Maximum concurrent requests reached.',
      );
    }
    this.activeGenerations++;

    const timeoutMs = this.config.timeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    if (options?.signal) {
      options.signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const payload: Record<string, unknown> = {
        model: this.config.llmModel,
        prompt,
        system: options?.systemPrompt,
        stream: false,
        think: false,
        options: {
          temperature: options?.temperature ?? 0.2,
          num_predict: options?.maxTokens ?? 512,
          stop: options?.stopSequences,
        },
      };

      if (options?.format) {
        payload.format = options.format;
      }

      const response = await fetch(`${this.config.ollamaBaseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 404) {
        this.recordFailure();
        throw new ModelNotFoundException(this.config.llmModel);
      }

      if (!response.ok) {
        this.recordFailure();
        throw new GenerationFailedException(
          `Ollama generation request failed with status HTTP ${response.status}`,
        );
      }

      const data = (await response.json()) as OllamaGenerateResponse;
      this.recordSuccess();

      let finishReason: 'stop' | 'length' | 'cancelled' = 'stop';
      if (data.done_reason === 'length') {
        finishReason = 'length';
      }

      const text = data.response?.trim() ? data.response : (data.thinking ?? '');

      return {
        text,
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
        modelIdentifier: this.config.llmModel,
        finishReason,
      };
    } catch (error: unknown) {
      clearTimeout(timeoutId);

      if (options?.signal?.aborted) {
        throw new GenerationCancelledException();
      }

      if (error instanceof GenerationFailedException || error instanceof ModelNotFoundException) {
        throw error;
      }

      this.recordFailure();

      if (error instanceof Error && error.name === 'AbortError') {
        throw new ProviderTimeoutException(`Ollama generation timed out after ${timeoutMs}ms.`);
      }

      const message = error instanceof Error ? error.message : 'Unknown inference error';
      this.logger.error(`Ollama inference failure: ${message}`);
      throw new LLMProviderUnavailableException(`Ollama service unreachable: ${message}`);
    } finally {
      this.activeGenerations--;
    }
  }

  public async *generateStream(
    prompt: string,
    options?: LLMGenerationOptions,
  ): AsyncIterable<string> {
    this.assertCircuitClosed();

    const controller = new AbortController();
    if (options?.signal) {
      options.signal.addEventListener('abort', () => controller.abort());
    }

    let response: Response;
    try {
      response = await fetch(`${this.config.ollamaBaseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.llmModel,
          prompt,
          system: options?.systemPrompt,
          stream: true,
          think: false,
          options: {
            temperature: options?.temperature ?? 0.2,
            num_predict: options?.maxTokens ?? 512,
            stop: options?.stopSequences,
          },
        }),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      this.recordFailure();
      if (options?.signal?.aborted) {
        throw new GenerationCancelledException();
      }
      const message = err instanceof Error ? err.message : 'Unknown connection error';
      throw new LLMProviderUnavailableException(`Ollama stream unreachable: ${message}`);
    }

    if (!response.ok || !response.body) {
      this.recordFailure();
      throw new GenerationFailedException(
        `Ollama streaming failed with status HTTP ${response.status}`,
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed) as OllamaGenerateResponse;
            const token = parsed.response || parsed.thinking;
            if (token) {
              yield token;
            }
          } catch {
            // Ignore partial non-json lines in stream chunk
          }
        }
      }
      this.recordSuccess();
    } catch (err: unknown) {
      this.recordFailure();
      if (options?.signal?.aborted) {
        throw new GenerationCancelledException();
      }
      throw new GenerationFailedException(
        `Error streaming tokens: ${err instanceof Error ? err.message : 'Unknown stream error'}`,
      );
    } finally {
      reader.releaseLock();
    }
  }

  private assertCircuitClosed(): void {
    if (!this.circuitBreaker.isOpen) return;

    const timeSinceFailure = Date.now() - this.circuitBreaker.lastFailureTime;
    if (timeSinceFailure > this.cooldownPeriodMs) {
      // Half-open transition: allow test request
      this.circuitBreaker.isOpen = false;
      this.circuitBreaker.failures = 0;
      return;
    }

    throw new LLMProviderUnavailableException(
      'Circuit breaker is open: LLM service is currently marked offline.',
    );
  }

  private recordFailure(): void {
    this.circuitBreaker.failures += 1;
    this.circuitBreaker.lastFailureTime = Date.now();
    if (this.circuitBreaker.failures >= this.failureThreshold) {
      this.circuitBreaker.isOpen = true;
      this.logger.warn(
        `Circuit breaker tripped open after ${this.circuitBreaker.failures} consecutive failures. Cooldown: ${this.cooldownPeriodMs}ms`,
      );
    }
  }

  private recordSuccess(): void {
    this.circuitBreaker.failures = 0;
    this.circuitBreaker.isOpen = false;
  }
}
