import { AppProvider, AppRouter, getAppConfig } from '@app/index';
import { initDebugHelpers } from '@shared/debug/debug-helper';
import '@shared/styles/globals.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { initMsw } from './test/mocks/init-msw';

async function bootstrap(): Promise<void> {
  // 1. Resolve typed application configuration
  getAppConfig();

  // 2. Conditionally initialize Mock Service Worker (MSW) in development mode
  await initMsw();

  // 3. Attach window.__KINERGY_DEBUG__ helpers
  initDebugHelpers();

  // 4. Locate HTML DOM mounting node
  const rootElement = document.getElementById('root');

  // 5. Mount Application Composition Root
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
