/**
 * Application Configuration Schema & Environment Resolver
 * Scope: Application Shell Configuration (Composition Root)
 */

export interface AppConfig {
  readonly env: 'development' | 'test' | 'production';
  readonly apiBaseUrl: string;
  readonly appTitle: string;
  readonly enableTelemetry: boolean;
  readonly queryDefaultStaleTimeMs: number;
  readonly queryMaxRetries: number;
}

/**
 * Resolves strongly-typed application configuration from Vite environment variables.
 * Enforces safe fallback defaults for non-production development environments.
 */
export function getAppConfig(overrides?: Partial<AppConfig>): AppConfig {
  const envMode = (import.meta.env.MODE as AppConfig['env']) || 'development';

  const baseConfig: AppConfig = {
    env: envMode,
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1',
    appTitle: import.meta.env.VITE_APP_TITLE || 'Kinergy Platform',
    enableTelemetry: import.meta.env.VITE_ENABLE_TELEMETRY === 'true',
    queryDefaultStaleTimeMs: 1000 * 60 * 5, // 5 minutes default stale time
    queryMaxRetries: 3, // Max 3 exponential backoff retries for 5xx/network errors
  };

  return {
    ...baseConfig,
    ...overrides,
  };
}
