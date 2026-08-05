import React from 'react';
import { NavLink } from 'react-router-dom';

export const SettingsNavTabs: React.FC = () => {
  return (
    <nav className="flex space-x-4 border-border border-b pb-2">
      <NavLink
        to="/settings/general"
        className={({ isActive }) =>
          `rounded-md px-3 py-2 font-medium text-sm transition-colors ${
            isActive
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          }`
        }
      >
        General Preferences
      </NavLink>
      <NavLink
        to="/settings/security"
        className={({ isActive }) =>
          `rounded-md px-3 py-2 font-medium text-sm transition-colors ${
            isActive
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          }`
        }
      >
        Security Controls
      </NavLink>
    </nav>
  );
};
