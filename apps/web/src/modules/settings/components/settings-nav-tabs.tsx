import React from 'react';
import { NavLink } from 'react-router-dom';

export const SettingsNavTabs: React.FC = () => {
  return (
    <nav
      aria-label="Settings Navigation"
      className="flex space-x-4 border-border border-b pb-2 overflow-x-auto scrollbar-none"
    >
      <NavLink
        to="/settings/general"
        className={({ isActive }) =>
          `rounded-md px-3 py-2 font-medium text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            isActive
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          }`
        }
      >
        General Preferences
      </NavLink>
      <NavLink
        to="/settings/security"
        className={({ isActive }) =>
          `rounded-md px-3 py-2 font-medium text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            isActive
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          }`
        }
      >
        Security Controls
      </NavLink>
    </nav>
  );
};
