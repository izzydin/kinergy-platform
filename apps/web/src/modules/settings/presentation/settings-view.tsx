import { Lock, Sliders } from 'lucide-react';
import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';

/**
 * Mock Settings View Shell
 *
 * Tabbed container layout validating module sub-routing, breadcrumb updates, and responsive tab navigation.
 */
export const SettingsView: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* View Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Platform Settings</h2>
        <p className="text-sm text-muted-foreground">
          Architecture validation view demonstrating sub-tab routing, active state highlights, and
          breadcrumb trails.
        </p>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-border/50 pb-2 overflow-x-auto">
        <NavLink
          to="/settings/general"
          className={({ isActive }) =>
            `flex items-center gap-2 rounded-xl px-3.5 py-2 font-medium text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm font-semibold'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`
          }
        >
          <Sliders className="h-4 w-4" />
          <span>General Preferences</span>
        </NavLink>

        <NavLink
          to="/settings/security"
          className={({ isActive }) =>
            `flex items-center gap-2 rounded-xl px-3.5 py-2 font-medium text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm font-semibold'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`
          }
        >
          <Lock className="h-4 w-4" />
          <span>Security & Privacy</span>
        </NavLink>
      </div>

      {/* Sub-route Tab Content Container */}
      <div className="pt-2">
        <Outlet />
      </div>
    </div>
  );
};
