import { Zap } from 'lucide-react';
import React, { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useNavigation } from '../navigation';

export interface NavItemDefinition {
  to: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }> | string;
  badge?: string | number;
}

export interface DashboardLayoutProps {
  children?: React.ReactNode;
  /** Optional override for navigation items */
  navigationItems?: NavItemDefinition[];
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
 * Consumes the configuration-driven Navigation Framework (`useNavigation()`) dynamically.
 *
 * Responsibilities:
 * - Layout structure & responsive grid composition
 * - Exposes stable extension points for Navigation, Header extra widgets, Breadcrumbs, and Module Content
 * - Zero hardcoded navigation lists
 * - Zero business domain logic
 */
export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  navigationItems: overrideNavItems,
  headerExtra,
  breadcrumbs,
  sidebarFooter,
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const { sections, items: navFrameworkItems } = useNavigation();

  // If override nav items provided, use them; otherwise construct from configuration-driven Navigation Framework
  const navItems: NavItemDefinition[] =
    overrideNavItems ||
    navFrameworkItems.map((item) => ({
      to: item.path,
      label: item.label,
      icon: typeof item.icon === 'function' ? item.icon : undefined,
      badge: item.badge,
    }));

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar Navigation Extension Point */}
      <aside
        className={`${
          isSidebarOpen ? 'w-64' : 'w-20'
        } flex flex-col border-r border-border/50 bg-card/50 transition-all duration-300`}
      >
        {/* Sidebar Header */}
        <div className="flex h-16 items-center gap-3 border-b border-border/50 px-4 font-bold text-lg">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow">
            <Zap className="h-5 w-5" />
          </div>
          {isSidebarOpen && (
            <span className="truncate bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">
              Kinergy
            </span>
          )}
        </div>

        {/* Configuration-Driven Navigation Sections & Items */}
        <nav className="flex-1 space-y-4 p-3 overflow-y-auto">
          {sections.length > 0 && !overrideNavItems
            ? sections.map((section) => (
                <div key={section.id} className="space-y-1">
                  {isSidebarOpen && section.title && (
                    <h3 className="px-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                      {section.title}
                    </h3>
                  )}
                  {section.items.map((item) => {
                    const Icon = typeof item.icon === 'function' ? item.icon : undefined;
                    return (
                      <NavLink
                        key={item.id}
                        to={item.path}
                        end={item.path === '/'}
                        className={({ isActive }) =>
                          `flex items-center gap-3 rounded-lg px-3 py-2.5 font-medium text-sm transition-colors ${
                            isActive
                              ? 'bg-primary text-primary-foreground shadow-sm'
                              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                          }`
                        }
                      >
                        {Icon && <Icon className="h-5 w-5 shrink-0" />}
                        {isSidebarOpen && <span className="flex-1 truncate">{item.label}</span>}
                        {isSidebarOpen && item.badge !== undefined && (
                          <span className="rounded-full bg-primary/20 px-2 py-0.5 font-semibold text-primary text-xs">
                            {item.badge}
                          </span>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              ))
            : navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-lg px-3 py-2.5 font-medium text-sm transition-colors ${
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      }`
                    }
                  >
                    {Icon && <Icon className="h-5 w-5 shrink-0" />}
                    {isSidebarOpen && <span className="flex-1 truncate">{item.label}</span>}
                    {isSidebarOpen && item.badge !== undefined && (
                      <span className="rounded-full bg-primary/20 px-2 py-0.5 font-semibold text-primary text-xs">
                        {item.badge}
                      </span>
                    )}
                  </NavLink>
                );
              })}
        </nav>

        {/* Sidebar Footer Extension Point */}
        <div className="border-t border-border/50 p-3 space-y-2">
          {sidebarFooter}
          <button
            type="button"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="flex w-full items-center justify-center rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground text-xs"
            aria-label="Toggle Sidebar"
          >
            {isSidebarOpen ? '← Collapse' : '→'}
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex flex-1 flex-col">
        {/* Header Extension Point */}
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border/50 bg-background/95 px-6 backdrop-blur">
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
        <main className="flex-1 p-6">{children || <Outlet />}</main>
      </div>
    </div>
  );
};
