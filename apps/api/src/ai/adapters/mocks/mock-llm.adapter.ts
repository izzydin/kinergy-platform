import { Injectable } from '@nestjs/common';
import {
  ILLMProviderPort,
  LLMGenerationOptions,
  LLMGenerationResult,
  GenerationCancelledException,
} from '@kinergy-platform/core';

@Injectable()
export class MockLLMAdapter implements ILLMProviderPort {
  private modelIdentifier = 'mock-llm-model';
  public cannedResponses: string[] = [];

  public getModelIdentifier(): string {
    return this.modelIdentifier;
  }

  public setModelIdentifier(name: string): void {
    this.modelIdentifier = name;
  }

  public async checkHealth(): Promise<{ isHealthy: boolean; model: string; latencyMs: number }> {
    return { isHealthy: true, model: this.modelIdentifier, latencyMs: 5 };
  }

  public async generateText(
    prompt: string,
    options?: LLMGenerationOptions,
  ): Promise<LLMGenerationResult> {
    if (options?.signal?.aborted) {
      throw new GenerationCancelledException();
    }

    const text =
      this.cannedResponses.shift() ?? `Mock response for prompt: "${prompt.slice(0, 30)}..."`;

    return {
      text,
      promptTokens: prompt.split(/\s+/).length,
      completionTokens: text.split(/\s+/).length,
      modelIdentifier: this.modelIdentifier,
      finishReason: 'stop',
    };
  }

  public async *generateStream(
    _prompt: string,
    options?: LLMGenerationOptions,
  ): AsyncIterable<string> {
    if (options?.signal?.aborted) {
      throw new GenerationCancelledException();
    }

    const tokens = ['This ', 'is ', 'a ', 'mock ', 'streamed ', 'response.'];
    for (const token of tokens) {
      if (options?.signal?.aborted) {
        throw new GenerationCancelledException();
      }
      yield token;
    }
  }
}
