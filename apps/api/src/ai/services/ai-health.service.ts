import { Inject, Injectable, Logger } from '@nestjs/common';
import { ILLMProviderPort, IEmbeddingProviderPort } from '@kinergy-platform/core';
import { AI_LLM_PROVIDER_TOKEN, AI_EMBEDDING_PROVIDER_TOKEN, AI_CONFIG_TOKEN } from '../ai.tokens';
import { AiConfiguration } from '../config/ai.config';

export interface ModelReadinessReport {
  name: string;
  isInstalled: boolean;
  isLoaded: boolean; // Resident in VRAM
  isCapable: boolean;
  latencyMs: number;
}

export interface ProviderHealthReport {
  isHealthy: boolean;
  model: string;
  latencyMs: number;
}

export interface AiSubsystemHealth {
  enabled: boolean;
  overallStatus: 'OPERATIONAL' | 'DEGRADED' | 'DISABLED' | 'OFFLINE';
  provider: 'ollama' | 'mock';
  runtimeReachable: boolean;
  models: {
    chat: ModelReadinessReport;
    embedding: ModelReadinessReport & { dimensions: number };
  };
  llm: ProviderHealthReport;
  embedding: ProviderHealthReport;
  timestamp: string;
}

interface OllamaTagModel {
  name: string;
  model: string;
  size: number;
  digest: string;
}

interface OllamaPsModel {
  name: string;
  model: string;
  size_vram?: number;
}

@Injectable()
export class AiHealthService {
  private readonly logger = new Logger(AiHealthService.name);

  constructor(
    @Inject(AI_CONFIG_TOKEN) private readonly config: AiConfiguration,
    @Inject(AI_LLM_PROVIDER_TOKEN) private readonly llmProvider: ILLMProviderPort,
    @Inject(AI_EMBEDDING_PROVIDER_TOKEN) private readonly embeddingProvider: IEmbeddingProviderPort,
  ) {}

  public async getHealthReport(): Promise<AiSubsystemHealth> {
    const timestamp = new Date().toISOString();

    if (!this.config.enabled) {
      return {
        enabled: false,
        overallStatus: 'DISABLED',
        provider: this.config.llmProvider,
        runtimeReachable: false,
        models: {
          chat: {
            name: this.config.chatModel,
            isInstalled: false,
            isLoaded: false,
            isCapable: false,
            latencyMs: 0,
          },
          embedding: {
            name: this.config.embeddingModel,
            dimensions: this.config.embeddingDimensions,
            isInstalled: false,
            isLoaded: false,
            isCapable: false,
            latencyMs: 0,
          },
        },
        llm: { isHealthy: false, model: this.config.chatModel, latencyMs: 0 },
        embedding: { isHealthy: false, model: this.config.embeddingModel, latencyMs: 0 },
        timestamp,
      };
    }

    if (this.config.llmProvider === 'mock') {
      const [llmHealth, embeddingHealth] = await Promise.all([
        this.llmProvider.checkHealth(),
        this.embeddingProvider.checkHealth
          ? this.embeddingProvider.checkHealth()
          : Promise.resolve({
              isHealthy: true,
              model: this.embeddingProvider.getModelIdentifier(),
              latencyMs: 1,
            }),
      ]);

      let overallStatus: 'OPERATIONAL' | 'DEGRADED' | 'DISABLED' | 'OFFLINE';
      if (llmHealth.isHealthy && embeddingHealth.isHealthy) {
        overallStatus = 'OPERATIONAL';
      } else if (llmHealth.isHealthy || embeddingHealth.isHealthy) {
        overallStatus = 'DEGRADED';
      } else {
        overallStatus = 'OFFLINE';
      }

      return {
        enabled: true,
        overallStatus,
        provider: 'mock',
        runtimeReachable: true,
        models: {
          chat: {
            name: llmHealth.model,
            isInstalled: llmHealth.isHealthy,
            isLoaded: llmHealth.isHealthy,
            isCapable: llmHealth.isHealthy,
            latencyMs: llmHealth.latencyMs,
          },
          embedding: {
            name: embeddingHealth.model,
            dimensions: this.config.embeddingDimensions,
            isInstalled: embeddingHealth.isHealthy,
            isLoaded: embeddingHealth.isHealthy,
            isCapable: embeddingHealth.isHealthy,
            latencyMs: embeddingHealth.latencyMs,
          },
        },
        llm: llmHealth,
        embedding: embeddingHealth,
        timestamp,
      };
    }

    // Live Ollama non-invasive inspection via /api/tags and /api/ps
    const t0 = Date.now();
    let runtimeReachable = false;
    let installedModels: OllamaTagModel[] = [];
    let loadedModels: OllamaPsModel[] = [];

    try {
      const timeoutMs = this.config.healthTimeoutMs;
      const [tagsRes, psRes] = await Promise.all([
        fetch(`${this.config.ollamaBaseUrl}/api/tags`, {
          signal: AbortSignal.timeout(timeoutMs),
        }),
        fetch(`${this.config.ollamaBaseUrl}/api/ps`, {
          signal: AbortSignal.timeout(timeoutMs),
        }).catch(() => null),
      ]);

      if (tagsRes.ok) {
        runtimeReachable = true;
        const tagsData = (await tagsRes.json()) as { models?: OllamaTagModel[] };
        installedModels = tagsData.models ?? [];
      }

      if (psRes && psRes.ok) {
        const psData = (await psRes.json()) as { models?: OllamaPsModel[] };
        loadedModels = psData.models ?? [];
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      this.logger.debug(`Ollama health check unreachable: ${msg}`);
      runtimeReachable = false;
    }

    const latencyMs = Date.now() - t0;

    const isModelInstalled = (target: string): boolean =>
      installedModels.some(
        (m) => m.name === target || m.name.startsWith(`${target}:`) || m.model === target,
      );

    const isModelLoaded = (target: string): boolean =>
      loadedModels.some(
        (m) => m.name === target || m.name.startsWith(`${target}:`) || m.model === target,
      );

    const chatInstalled = isModelInstalled(this.config.chatModel);
    const chatLoaded = isModelLoaded(this.config.chatModel);
    const chatCapable = runtimeReachable && chatInstalled;

    const embedInstalled = isModelInstalled(this.config.embeddingModel);
    const embedLoaded = isModelLoaded(this.config.embeddingModel);
    const embedCapable = runtimeReachable && embedInstalled;

    let overallStatus: 'OPERATIONAL' | 'DEGRADED' | 'DISABLED' | 'OFFLINE';
    if (!runtimeReachable) {
      overallStatus = 'OFFLINE';
    } else if (chatCapable && embedCapable) {
      overallStatus = 'OPERATIONAL';
    } else if (chatCapable || embedCapable) {
      overallStatus = 'DEGRADED';
    } else {
      overallStatus = 'OFFLINE';
    }

    const llmHealth: ProviderHealthReport = {
      isHealthy: chatCapable,
      model: this.config.chatModel,
      latencyMs,
    };

    const embeddingHealth: ProviderHealthReport = {
      isHealthy: embedCapable,
      model: this.config.embeddingModel,
      latencyMs,
    };

    return {
      enabled: true,
      overallStatus,
      provider: 'ollama',
      runtimeReachable,
      models: {
        chat: {
          name: this.config.chatModel,
          isInstalled: chatInstalled,
          isLoaded: chatLoaded,
          isCapable: chatCapable,
          latencyMs,
        },
        embedding: {
          name: this.config.embeddingModel,
          dimensions: this.config.embeddingDimensions,
          isInstalled: embedInstalled,
          isLoaded: embedLoaded,
          isCapable: embedCapable,
          latencyMs,
        },
      },
      llm: llmHealth,
      embedding: embeddingHealth,
      timestamp,
    };
  }
}
