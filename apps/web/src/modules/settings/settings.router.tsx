import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { GeneralSettingsView } from './presentation/general-settings-view';
import { SecuritySettingsView } from './presentation/security-settings-view';
import { SettingsView } from './presentation/settings-view';

/**
 * Settings Sub-Router
 *
 * Encapsulates settings sub-routes (`/settings/general`, `/settings/security`)
 * and specifies route handle breadcrumb metadata.
 */
export const SettingsRouter: React.FC = () => {
  return (
    <Routes>
      <Route element={<SettingsView />}>
        <Route index element={<Navigate to="general" replace />} />
        <Route
          path="general"
          element={<GeneralSettingsView />}
          handle={{
            breadcrumb: 'General Settings',
          }}
        />
        <Route
          path="security"
          element={<SecuritySettingsView />}
          handle={{
            breadcrumb: 'Security Settings',
          }}
        />
      </Route>
    </Routes>
  );
};
