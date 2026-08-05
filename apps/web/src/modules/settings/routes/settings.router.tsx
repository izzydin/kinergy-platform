import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { GeneralSettingsPage } from './general-settings-page';
import { SecuritySettingsPage } from './security-settings-page';
import { SettingsLayoutPage } from './settings-layout-page';

/**
 * Settings Sub-Router
 * Encapsulates sub-routes (/settings/general, /settings/security)
 * and specifies breadcrumb handle metadata.
 */
export const SettingsRouter: React.FC = () => {
  return (
    <Routes>
      <Route element={<SettingsLayoutPage />}>
        <Route index element={<Navigate to="general" replace />} />
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
  );
};
