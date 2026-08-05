import React from 'react';
import { Outlet } from 'react-router-dom';
import { SettingsNavTabs } from '../components/settings-nav-tabs';

export const SettingsLayoutPage: React.FC = () => {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="font-bold text-3xl tracking-tight text-foreground">Platform Settings</h1>
        <p className="text-muted-foreground text-sm">
          Architectural validation module for settings sub-routing, form primitives, and layout
          nesting.
        </p>
      </div>

      <SettingsNavTabs />

      <div className="pt-2">
        <Outlet />
      </div>
    </div>
  );
};
