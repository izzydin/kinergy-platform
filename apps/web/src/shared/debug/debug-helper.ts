import type { QueryClient } from '@tanstack/react-query';
import { getAppConfig } from '../../app/config/app-config';
import { logger } from '../logger/platform-logger';

export interface KinergyDebugGlobal {
  config: ReturnType<typeof getAppConfig>;
  logger: typeof logger;
  queryClient?: QueryClient;
  version: string;
}

declare global {
  interface Window {
    __KINERGY_DEBUG__?: KinergyDebugGlobal;
  }
}

/**
 * Registers global window.__KINERGY_DEBUG__ helper strictly in development environment.
 * In production or test environments, or when isDev is false, this function is a complete no-op.
 * URL parameters, storage keys, or runtime flags cannot force debug helper attachment in production.
 */
export function initDebugHelpers(
  queryClient?: QueryClient,
  overrideConfig?: ReturnType<typeof getAppConfig>,
): boolean {
  if (typeof window === 'undefined') return false;

  const config = overrideConfig ?? getAppConfig();

  // Strict boundary: Only development mode allows debug helper registration
  if (!config.isDev || config.isProd) {
    if (window.__KINERGY_DEBUG__) {
      delete window.__KINERGY_DEBUG__;
    }
    return false;
  }

  window.__KINERGY_DEBUG__ = {
    config,
    logger,
    queryClient,
    version: '1.0.0-dev',
  };

  logger.debug('Kinergy Debug Helpers attached to window.__KINERGY_DEBUG__');
  return true;
}
