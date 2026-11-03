import React, { Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { moduleRegistry } from '../../../app/routes/module-registry';
import { lazyWithRetry, SuspenseFallback } from '../../../app/routes/lazy-loading';

const SettingsLayoutPage = lazyWithRetry(() =>
  import('./settings-layout-page').then((m) => ({ default: m.SettingsLayoutPage })),
);
const GeneralSettingsPage = lazyWithRetry(() =>
  import('./general-settings-page').then((m) => ({ default: m.GeneralSettingsPage })),
);
const SecuritySettingsPage = lazyWithRetry(() =>
  import('./security-settings-page').then((m) => ({ default: m.SecuritySettingsPage })),
);

/**
 * Deterministic index redirect that preserves search query parameters
 * (e.g. ?tab=security) and hash fragments (#section) on entry.
 */
const SettingsIndexRedirect: React.FC = () => {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const tab = searchParams.get('tab');
  const targetSubpath = tab === 'security' ? 'security' : 'general';

  return (
    <Navigate
      to={{
        pathname: targetSubpath,
        search: location.search,
        hash: location.hash,
      }}
      replace
    />
  );
};

/**
 * Settings Sub-Router
 * Encapsulates sub-routes (/settings/general, /settings/security)
 * and specifies breadcrumb handle metadata.
 */
export const SettingsRouter: React.FC = () => {
  return (
    <Suspense fallback={<SuspenseFallback label="Loading Settings..." />}>
      <Routes>
        <Route element={<SettingsLayoutPage />}>
          <Route index element={<SettingsIndexRedirect />} />
          <Route
            path="general"
            element={<GeneralSettingsPage />}
            handle={{
              breadcrumb: 'General Settings',
            }}
          />
          <Route
            path="security"
            element={<SecuritySettingsPage />}
            handle={{
              breadcrumb: 'Security Settings',
            }}
          />
        </Route>
      </Routes>
    </Suspense>
  );
};

// Register Settings Feature Module Contract with central router shell
moduleRegistry.register({
  id: 'settings',
  prefix: '/settings',
  title: 'Platform Settings',
  isProtected: true,
  component: SettingsRouter,
});
