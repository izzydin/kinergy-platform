import React from 'react';
import { Outlet } from 'react-router-dom';

export interface BlankLayoutProps {
  children?: React.ReactNode;
}

/**
 * BlankLayout Shell Component
 *
 * Minimalist layout wrapper for unadorned, full-screen, or custom page view boundaries.
 * Exposes stable extension points for future full-bleed feature modules, widgets, or modal viewports.
 *
 * Responsibilities:
 * - Layout composition only
 * - Zero business logic
 * - Zero authentication logic
 * - Zero feature-specific component dependencies
 */
export const BlankLayout: React.FC<BlankLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      {children || <Outlet />}
    </div>
  );
};
