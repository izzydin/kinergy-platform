import React from 'react';
import { Outlet } from 'react-router-dom';
import { Badge } from '@kinergy-platform/ui';
import { SettingsNavTabs } from '../components/settings-nav-tabs';

export const SettingsLayoutPage: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* 1. Header & Title */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-3xl tracking-tight text-foreground">Platform Settings</h1>
            <Badge variant="outline" className="hidden sm:inline-flex">
              Step A5.3 Validation
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            Architectural validation screen verifying Form Foundation, React Hook Form + Zod
            resolvers, PasswordInput primitives, Avatars, Dialogs, Toasts, and Theme tokens.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">React Hook Form</Badge>
          <Badge variant="secondary">Zod Validation</Badge>
          <Badge variant="secondary">Radix UI</Badge>
        </div>
      </div>

      {/* 2. Sub-Navigation Tabs */}
      <SettingsNavTabs />

      {/* 3. Nested Sub-Route Outlet */}
      <div className="pt-2">
        <Outlet />
      </div>
    </div>
  );
};
