import React from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from '../../shared/components/header';
import { Sidebar } from '../../shared/components/sidebar';

export interface DashboardLayoutProps {
  children?: React.ReactNode;
  /** Extension point: Dynamic breadcrumb bar slot */
  breadcrumbs?: React.ReactNode;
  /** Extension point: Global search component slot */
  search?: React.ReactNode;
  /** Extension point: Notification drawer trigger slot */
  notifications?: React.ReactNode;
  /** Extension point: User profile menu slot */
  userMenu?: React.ReactNode;
  /** Extension point: Header toolbar extra widgets */
  headerExtra?: React.ReactNode;
  /** Extension point: Custom sidebar footer controls */
  sidebarFooter?: React.ReactNode;
}

/**
 * DashboardLayout Shell Component
 *
 * Enterprise layout composition root for authenticated dashboard views.
 * Integrates the responsive `<Sidebar />` and slot-based `<Header />` framework.
 *
 * Responsibilities:
 * - Layout structure & responsive grid composition
 * - Exposes stable extension points for Navigation, Header extra widgets, Breadcrumbs, and Module Content
 * - Zero hardcoded navigation lists
 * - Zero business domain logic
 */
export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  breadcrumbs,
  search,
  notifications,
  userMenu,
  headerExtra,
  sidebarFooter,
}) => {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Responsive, Accessible, Configuration-Driven Sidebar */}
      <Sidebar footer={sidebarFooter} />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header Framework Extension Points */}
        <Header
          breadcrumbs={breadcrumbs}
          search={search}
          notifications={notifications}
          userMenu={userMenu}
          extra={headerExtra}
        />

        {/* Module Content Extension Point */}
        <main className="flex-1 p-6 overflow-x-hidden">{children || <Outlet />}</main>
      </div>
    </div>
  );
};
