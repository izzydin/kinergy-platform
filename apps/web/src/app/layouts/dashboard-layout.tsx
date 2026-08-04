import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from '../../shared/components/sidebar';

export interface DashboardLayoutProps {
  children?: React.ReactNode;
  /** Extension point: Header toolbar extra widgets (user menu, notifications, system status) */
  headerExtra?: React.ReactNode;
  /** Extension point: Dynamic breadcrumb bar */
  breadcrumbs?: React.ReactNode;
  /** Extension point: Custom sidebar footer controls */
  sidebarFooter?: React.ReactNode;
}

/**
 * DashboardLayout Shell Component
 *
 * Enterprise layout composition root for authenticated dashboard views.
 * Integrates the responsive, configuration-driven `<Sidebar />` component.
 *
 * Responsibilities:
 * - Layout structure & responsive grid composition
 * - Exposes stable extension points for Navigation, Header extra widgets, Breadcrumbs, and Module Content
 * - Zero hardcoded navigation lists
 * - Zero business domain logic
 */
export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  headerExtra,
  breadcrumbs,
  sidebarFooter,
}) => {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Responsive, Accessible, Configuration-Driven Sidebar */}
      <Sidebar footer={sidebarFooter} />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header Extension Point */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/50 bg-background/80 px-6 backdrop-blur-md">
          <div className="flex items-center gap-4">
            {/* Breadcrumb Extension Slot */}
            {breadcrumbs || <h1 className="font-semibold text-lg">Enterprise Energy Dashboard</h1>}
          </div>

          {/* Header Extra Widgets Slot */}
          <div className="flex items-center gap-4">
            {headerExtra || (
              <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-medium text-emerald-500 text-xs">
                System Operational
              </span>
            )}
          </div>
        </header>

        {/* Module Content Extension Point */}
        <main className="flex-1 p-6 overflow-x-hidden">{children || <Outlet />}</main>
      </div>
    </div>
  );
};
