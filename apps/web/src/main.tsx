import { AppProvider, AppRouter, getAppConfig } from '@app/index';
import { httpClient } from '@shared/api';
import { setupAuthTransport } from '@shared/auth';
import { initDebugHelpers } from '@shared/debug/debug-helper';
import '@shared/styles/globals.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { initMsw } from './test/mocks/init-msw';

async function bootstrap(): Promise<void> {
  // 1. Resolve typed application configuration
  getAppConfig();

  // 2. Wire authentication transport onto shared HttpClient
  setupAuthTransport(httpClient);

  // 3. Conditionally initialize Mock Service Worker (MSW) in development mode
  await initMsw();

  // 4. Attach window.__KINERGY_DEBUG__ helpers
  initDebugHelpers();

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
