import { AppProvider, AppRouter, getAppConfig } from '@app/index';
import '@shared/styles/globals.css';
import React from 'react';
import ReactDOM from 'react-dom/client';

// 1. Resolve typed application configuration
getAppConfig();

// 2. Locate HTML DOM mounting node
const rootElement = document.getElementById('root');

// 3. Mount Application Composition Root
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <AppProvider>
        <AppRouter />
      </AppProvider>
    </React.StrictMode>,
  );
}
