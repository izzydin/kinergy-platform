import { Activity, ArrowUpRight, BarChart2, ShieldCheck, Zap } from 'lucide-react';
import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Mock Dashboard View Component
 *
 * Presentation-only view used strictly to validate:
 * - Routing & layout shell composition
 * - Breadcrumb metadata resolution
 * - Responsive grid container behavior
 *
 * Contains zero production business logic.
 */
export const DashboardView: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Operational Dashboard
          </h2>
          <p className="text-sm text-muted-foreground">
            Architecture validation view for application shell, routing, and navigation layout.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/dashboard/metrics"
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 font-medium text-xs text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span>View Performance Metrics</span>
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Responsive Summary KPI Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border/60 bg-card/60 p-4 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">System Status</span>
            <Zap className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 text-xl font-extrabold text-foreground">100% Operational</p>
          <span className="text-[11px] text-emerald-500 font-medium">All services connected</span>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/60 p-4 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Routing Shell</span>
            <Activity className="h-4 w-4 text-blue-500" />
          </div>
          <p className="mt-2 text-xl font-extrabold text-foreground">Hybrid Feature Router</p>
          <span className="text-[11px] text-muted-foreground">Lazy-loading active</span>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/60 p-4 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Navigation Tree</span>
            <BarChart2 className="h-4 w-4 text-indigo-500" />
          </div>
          <p className="mt-2 text-xl font-extrabold text-foreground">Registry Driven</p>
          <span className="text-[11px] text-muted-foreground">Permission-aware filtering</span>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/60 p-4 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Security State</span>
            <ShieldCheck className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-2 text-xl font-extrabold text-foreground">Session Guarded</p>
          <span className="text-[11px] text-muted-foreground">ProtectedRoute verified</span>
        </div>
      </div>

      {/* Validation Demonstration Panel */}
      <div className="rounded-2xl border border-border/60 bg-card/60 p-6 shadow-sm backdrop-blur-sm space-y-4">
        <h3 className="font-semibold text-lg text-foreground">Architecture Validation Overview</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          This mock Dashboard feature module validates the decoupling between application
          composition roots, layout shells, and domain feature modules.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          <div className="rounded-xl border border-border/40 bg-muted/20 p-3 text-xs">
            <span className="font-bold block text-foreground mb-1">1. Routing Isolation</span>
            <span>Feature sub-routers control nested route paths (`/dashboard/*`).</span>
          </div>
          <div className="rounded-xl border border-border/40 bg-muted/20 p-3 text-xs">
            <span className="font-bold block text-foreground mb-1">2. Auto Breadcrumbs</span>
            <span>Breadcrumb trails generated dynamically from route metadata.</span>
          </div>
          <div className="rounded-xl border border-border/40 bg-muted/20 p-3 text-xs">
            <span className="font-bold block text-foreground mb-1">3. Responsive Layout</span>
            <span>Adapts gracefully across mobile drawers, tablet grids, and desktop views.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
