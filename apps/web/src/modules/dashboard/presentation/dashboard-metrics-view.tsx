import { ArrowLeft, Cpu, Database, Network } from 'lucide-react';
import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Mock Dashboard Performance Metrics View
 *
 * Presentation-only sub-view used to validate sub-routing (`/dashboard/metrics`)
 * and nested breadcrumb trail resolution.
 */
export const DashboardMetricsView: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Performance & System Metrics
          </h2>
          <p className="text-sm text-muted-foreground">
            Sub-route validation view demonstrating nested routing metadata resolution.
          </p>
        </div>
        <div>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-card/60 px-3.5 py-2 font-medium text-xs text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Dashboard</span>
          </Link>
        </div>
      </div>

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border/60 bg-card/60 p-5 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Cpu className="h-5 w-5 text-indigo-500" />
            <span className="font-semibold text-xs uppercase tracking-wider">CPU Allocation</span>
          </div>
          <p className="mt-3 text-2xl font-extrabold text-foreground">12.4% Average</p>
          <span className="text-xs text-emerald-500 font-medium">Optimal performance</span>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/60 p-5 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Database className="h-5 w-5 text-blue-500" />
            <span className="font-semibold text-xs uppercase tracking-wider">Memory Cache</span>
          </div>
          <p className="mt-3 text-2xl font-extrabold text-foreground">148 MB Used</p>
          <span className="text-xs text-muted-foreground font-medium">TanStack Query Cache</span>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/60 p-5 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Network className="h-5 w-5 text-amber-500" />
            <span className="font-semibold text-xs uppercase tracking-wider">Network Latency</span>
          </div>
          <p className="mt-3 text-2xl font-extrabold text-foreground">18 ms Latency</p>
          <span className="text-xs text-emerald-500 font-medium">MSW Mock Handler</span>
        </div>
      </div>
    </div>
  );
};
