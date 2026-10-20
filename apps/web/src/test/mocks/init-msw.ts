import { getAppConfig, type AppConfig } from '../../app/config/app-config';

export interface MswInitResult {
  initialized: boolean;
  reason?: 'production_mode' | 'not_development' | 'opt_out' | 'worker_error';
  error?: unknown;
}

/**
 * Conditionally initializes Mock Service Worker (MSW) in the browser during development.
 * Safely wrapped in a try/catch block to guarantee that MSW initialization failures
 * never block application UI mounting or rendering.
 *
 * Explicit Activation Rules:
 * 1. Production builds or runtimes NEVER start MSW under any circumstances.
 * 2. Development MSW activation strictly requires an explicit opt-in (VITE_ENABLE_MSW === 'true').
 * 3. Unset, invalid, or unexpected flag values default to MSW disabled.
 * 4. Fails safely: A failure to initialize MSW logs a warning and leaves native fetch intact,
 *    never blocking application mounting or silently mocking real requests.
 */
export async function initMsw(overrideConfig?: AppConfig): Promise<MswInitResult> {
  const config = overrideConfig ?? getAppConfig();

  // Rule 1: Never initialize in production
  if (config.isProd) {
    return { initialized: false, reason: 'production_mode' };
  }

  // Rule 2: Must be development mode
  if (!config.isDev) {
    return { initialized: false, reason: 'not_development' };
  }

  // Rule 3: Must have explicit opt-in
  if (!config.enableMsw) {
    return { initialized: false, reason: 'opt_out' };
  }

  try {
    const { worker } = await import('./browser');
    await worker.start({
      onUnhandledRequest: 'bypass',
      serviceWorker: {
        url: '/mockServiceWorker.js',
      },
    });
    // eslint-disable-next-line no-console
    console.log('[MSW] Mock Service Worker initialized successfully (opt-in enabled).');
    return { initialized: true };
  } catch (error) {
    console.warn(
      '[MSW] Failed to start Mock Service Worker. Continuing with native fetch requests:',
      error,
    );
    return { initialized: false, reason: 'worker_error', error };
  }
}
