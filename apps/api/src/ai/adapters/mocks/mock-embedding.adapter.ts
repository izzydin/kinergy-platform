import { Injectable } from '@nestjs/common';
import { IEmbeddingProviderPort, EmbeddingOptions } from '@kinergy-platform/core';

@Injectable()
export class MockEmbeddingAdapter implements IEmbeddingProviderPort {
  private readonly dimensions = 1024;
  private modelIdentifier = 'mock-embedding-model';

  public getDimensions(): number {
    return this.dimensions;
  }

  public getModelIdentifier(): string {
    return this.modelIdentifier;
  }

  public setModelIdentifier(name: string): void {
    this.modelIdentifier = name;
  }

  public async checkHealth(): Promise<{ isHealthy: boolean; model: string; latencyMs: number }> {
    return { isHealthy: true, model: this.modelIdentifier, latencyMs: 2 };
  }

  public async generateEmbedding(text: string, _options?: EmbeddingOptions): Promise<number[]> {
    // Generate deterministic 1024-dim vector based on string hash
    const vector = new Array<number>(this.dimensions).fill(0);
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
    }

    for (let i = 0; i < this.dimensions; i++) {
      // Deterministic float in [-1, 1]
      vector[i] = Math.sin(hash + i);
    }

    // Normalize vector
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
    return vector.map((v) => v / norm);
  }

  public async generateBatchEmbeddings(
    texts: string[],
    options?: EmbeddingOptions,
  ): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.generateEmbedding(t, options)));
  }
}
