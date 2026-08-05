import React from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from '../../shared/components/header';
import { Sidebar } from '../../shared/components/sidebar';
import { SlotTarget } from '../../shared/ui/slots';
import { Breadcrumb } from '../breadcrumbs';

export interface DashboardLayoutProps {
  children?: React.ReactNode;
  /** Extension point: Dynamic breadcrumb bar slot (defaults to auto-generated <Breadcrumb />) */
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
 * Exposes predefined `<SlotTarget />` insertion points:
 * - `header-breadcrumbs`
 * - `header-search`
 * - `header-actions`
 * - `page-status`
 * - `page-toolbar`
 * - `page-tabs`
 * - `sidebar-footer`
 * - `footer-actions`
 */
export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  breadcrumbs = <Breadcrumb />,
  search,
  notifications,
  userMenu,
  headerExtra,
  sidebarFooter,
}) => {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Responsive, Accessible, Configuration-Driven Sidebar */}
      <Sidebar footer={<SlotTarget name="sidebar-footer">{sidebarFooter}</SlotTarget>} />

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

        {/* Dynamic Contextual Toolbar & Status Slots */}
        <div className="flex flex-col gap-2 px-6 pt-4">
          <SlotTarget name="page-status" />
          <SlotTarget name="page-toolbar" />
          <SlotTarget name="page-tabs" />
        </div>

        {/* Module Content Extension Point */}
        <main className="flex-1 p-6 overflow-x-hidden">{children || <Outlet />}</main>

        {/* Footer Actions Slot */}
        <SlotTarget name="footer-actions" className="px-6 py-3 border-t border-border/40" />
      </div>
    </div>
  );
};
