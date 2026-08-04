import { getAppConfig } from '../../app/config/app-config';

/**
 * Conditionally initializes Mock Service Worker (MSW) in the browser during development.
 */
export async function initMsw(): Promise<void> {
  const config = getAppConfig();

  if (import.meta.env.DEV && config.enableMsw) {
    const { worker } = await import('./browser');
    await worker.start({
      onUnhandledRequest: 'bypass',
      serviceWorker: {
        url: '/mockServiceWorker.js',
      },
    });
    // eslint-disable-next-line no-console
    console.log('[MSW] Mock Service Worker initialized successfully.');
  }
}
