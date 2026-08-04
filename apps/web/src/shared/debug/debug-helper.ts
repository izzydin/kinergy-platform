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
 * Registers global window.__KINERGY_DEBUG__ helper in development environment.
 */
export function initDebugHelpers(queryClient?: QueryClient): void {
  if (typeof window === 'undefined') return;

  const config = getAppConfig();

  if (import.meta.env.DEV || config.env === 'development') {
    window.__KINERGY_DEBUG__ = {
      config,
      logger,
      queryClient,
      version: '1.0.0-dev',
    };

    logger.debug('Kinergy Debug Helpers attached to window.__KINERGY_DEBUG__');
  }
}
