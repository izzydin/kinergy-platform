import { AppProvider } from '@/providers/app-provider';
import { AppRouter } from '@/routes/app-router';
import '@/styles/globals.css';
import React from 'react';
import ReactDOM from 'react-dom/client';

const rootElement = document.getElementById('root');

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <AppProvider>
        <AppRouter />
      </AppProvider>
    </React.StrictMode>,
  );
}
