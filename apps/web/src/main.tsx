import { AppProvider, AppRouter, getAppConfig } from '@app/index';
import { httpClient } from '@shared/api';
import { setupAuthTransport } from '@shared/auth';
import '@shared/styles/globals.css';
import React from 'react';
import ReactDOM from 'react-dom/client';

async function bootstrap(): Promise<void> {
  // 1. Resolve typed application configuration
  getAppConfig();

  // 2. Wire authentication transport onto shared HttpClient
  setupAuthTransport(httpClient);

  // 3. In development mode only, conditionally initialize Mock Service Worker (MSW) and debug helpers.
  // Gating behind import.meta.env.DEV guarantees Rollup/Vite dead-code eliminates these modules in production builds.
  if (import.meta.env.DEV) {
    const { initMsw } = await import('./test/mocks/init-msw');
    await initMsw();

    const { initDebugHelpers } = await import('./shared/debug/debug-helper');
    initDebugHelpers();
  }

  // 5. Locate HTML DOM mounting node
  const rootElement = document.getElementById('root');

  // 6. Mount Application Composition Root
  if (rootElement) {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <AppProvider>
          <AppRouter />
        </AppProvider>
      </React.StrictMode>,
    );
  }
}

void bootstrap();
