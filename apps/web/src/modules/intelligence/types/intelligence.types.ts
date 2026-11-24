/**
 * Module-level types and contracts for Kynergy Intelligence.
 */

export type IntelligenceSubsystemType = 'llm' | 'embedding' | 'vectorDatabase';

export type IntelligenceSubsystemStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface IntelligenceSubsystemHealth {
  readonly status: IntelligenceSubsystemStatus;
  readonly provider?: string;
  readonly model?: string;
  readonly latencyMs?: number;
  readonly error?: string;
}

export interface IntelligenceHealthState {
  readonly status: IntelligenceSubsystemStatus;
  readonly timestamp: string;
  readonly subsystems: {
    readonly llm: IntelligenceSubsystemHealth;
    readonly embedding: IntelligenceSubsystemHealth;
    readonly vectorDatabase: IntelligenceSubsystemHealth;
  };
}

export type IntelligenceNavigationTab = 'chat' | 'knowledge';

export interface IntelligenceModuleConfig {
  readonly defaultRoute: string;
  readonly enableHealthMonitoring: boolean;
  readonly healthPollIntervalMs: number;
}
