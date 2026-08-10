import { getAppConfig } from '../../app/config/app-config';

/**
 * Conditionally initializes Mock Service Worker (MSW) in the browser during development.
 * Safely wrapped in a try/catch block to guarantee that MSW initialization failures
 * never block application UI mounting or rendering.
 */
export async function initMsw(): Promise<void> {
  const config = getAppConfig();

  if (config.isDev && config.enableMsw) {
    try {
      const { worker } = await import('./browser');
      await worker.start({
        onUnhandledRequest: 'bypass',
        serviceWorker: {
          url: '/mockServiceWorker.js',
        },
      });
      // eslint-disable-next-line no-console
      console.log('[MSW] Mock Service Worker initialized successfully.');
    } catch (error) {
      console.warn(
        '[MSW] Failed to start Mock Service Worker. Continuing with native fetch requests:',
        error,
      );
    }
  }
}
