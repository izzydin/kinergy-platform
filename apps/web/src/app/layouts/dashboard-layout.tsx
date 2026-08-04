import { Activity, BarChart3, LayoutDashboard, Shield, Users, Zap } from 'lucide-react';
import React, { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

/**
 * DashboardLayout Shell
 *
 * Enterprise Dashboard Layout Wrapper.
 * Provides a responsive sidebar, sticky top header bar, and main content area.
 */
export const DashboardLayout: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const navItems = [
    { to: '/', label: 'Overview', icon: LayoutDashboard },
    { to: '/clients', label: 'Client Profiles', icon: Users },
    { to: '/energy', label: 'Energy Telemetry', icon: Activity },
    { to: '/analytics', label: 'Analytics', icon: BarChart3 },
    { to: '/admin', label: 'Administration', icon: Shield },
  ];

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar Navigation */}
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

        {/* Navigation Items */}
        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => {
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
                <Icon className="h-5 w-5 shrink-0" />
                {isSidebarOpen && <span>{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* Sidebar Toggle Button */}
        <div className="border-t border-border/50 p-3">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="flex w-full items-center justify-center rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Toggle Sidebar"
          >
            {isSidebarOpen ? '← Collapse' : '→'}
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex flex-1 flex-col">
        {/* Sticky Header */}
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border/50 bg-background/95 px-6 backdrop-blur">
          <h1 className="font-semibold text-lg">Enterprise Energy Dashboard</h1>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-medium text-emerald-500 text-xs">
              System Operational
            </span>
          </div>
        </header>

        {/* Content Outlet */}
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
