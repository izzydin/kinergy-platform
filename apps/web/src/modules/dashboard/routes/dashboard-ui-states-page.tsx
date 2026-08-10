import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  StateView,
} from '@kinergy-platform/ui';
import { SlotInject } from '../../../shared/ui/slots';
import { SettingsProfileSection } from '../../settings/components/settings-profile-section';
import { DashboardActivitySection } from '../components/dashboard-activity-section';
import { DashboardMetricsSection } from '../components/dashboard-metrics-section';
import { InfrastructureIntegrationPanel } from '../components/infrastructure-integration-panel';

// Re-use the SimulationState type defined in dashboard-queries
type SimulationState = 'success' | 'loading' | 'empty' | 'error';

// ─────────────────────────────────────────────────────────────────────────────
// State Simulation Controller
// ─────────────────────────────────────────────────────────────────────────────

interface SimulationControllerProps {
  readonly current: SimulationState;
  readonly onChange: (state: SimulationState) => void;
  readonly label?: string;
}

const SimulationController: React.FC<SimulationControllerProps> = ({
  current,
  onChange,
  label,
}) => {
  const states: { state: SimulationState; variant: 'default' | 'outline' | 'destructive' }[] = [
    { state: 'success', variant: 'default' },
    { state: 'loading', variant: 'outline' },
    { state: 'empty', variant: 'outline' },
    { state: 'error', variant: 'destructive' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {label && <span className="text-xs font-medium text-muted-foreground mr-1">{label}:</span>}
      {states.map(({ state, variant }) => (
        <Button
          key={state}
          size="sm"
          variant={
            current === state ? (variant === 'destructive' ? 'destructive' : 'default') : 'outline'
          }
          onClick={() => onChange(state)}
          data-testid={`sim-btn-${state}`}
        >
          {state.charAt(0).toUpperCase() + state.slice(1)}
        </Button>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// StateView Showcase Panel
//
// Directly renders StateView in each of its four operational states
// so the validation screen verifies the primitive itself.
// ─────────────────────────────────────────────────────────────────────────────

interface StateViewShowcasePanelProps {
  readonly simulationState: SimulationState;
}

const StateViewShowcasePanel: React.FC<StateViewShowcasePanelProps> = ({ simulationState }) => (
  <Card className="w-full">
    <CardHeader>
      <div className="flex items-center justify-between">
        <div>
          <CardTitle>StateView Primitive Showcase</CardTitle>
          <CardDescription>
            Direct validation of the shared StateView component across all four operational states.
          </CardDescription>
        </div>
        <Badge variant="outline">@kinergy-platform/ui</Badge>
      </div>
    </CardHeader>
    <CardContent>
      <StateView
        isLoading={simulationState === 'loading'}
        isError={simulationState === 'error'}
        errorMessage="Simulated API gateway failure — StateView error state validation."
        onRetry={() => {}}
        isEmpty={simulationState === 'empty'}
        emptyTitle="No Data Available"
        emptyDescription="The validation scenario produced an empty dataset. No records match your request."
        emptyAction={
          <Button variant="outline" size="sm" disabled>
            Create First Record
          </Button>
        }
        data-testid="state-view-showcase"
      >
        {/* 4. SUCCESS STATE */}
        <div
          className="rounded-lg border border-border bg-muted/30 p-4"
          data-testid="state-view-success"
        >
          <p className="font-semibold text-foreground text-sm">StateView Success State</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Server data resolved successfully. Populated content is rendered in place of the
            skeleton, error, or empty fallbacks.
          </p>
        </div>
      </StateView>
    </CardContent>
  </Card>
);

// ─────────────────────────────────────────────────────────────────────────────
// Page Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DashboardUiStatesPage — Milestone A5.6 Validation Screen
 *
 * A dedicated architectural validation route at /dashboard/ui-states that
 * stress-tests all five UI states across every async feature component:
 *
 *   1. Loading  — fetch in-flight (enabled: false)
 *   2. Skeleton — layout-matching content placeholder
 *   3. Empty    — fetch succeeded with empty dataset
 *   4. Error    — fetch failed (simulated network/server error)
 *   5. Success  — fetch succeeded with populated data
 *
 * Architecture compliance:
 * - Reuses the simulationState pattern established in A5.2 (DashboardOverviewPage)
 * - Reuses existing simulation hooks (useDashboardMetrics, useDashboardActivities)
 * - Reuses SettingsProfileSection (new in A5.6) for profile state coverage
 * - Demonstrates StateView primitive directly (shared infrastructure validation)
 * - No new state management infrastructure — pure reuse of existing shared layer
 */
export const DashboardUiStatesPage: React.FC = () => {
  const [globalState, setGlobalState] = useState<SimulationState>('success');

  return (
    <div className="space-y-6">
      {/* Header Action Slot */}
      <SlotInject target="header-actions">
        <Button asChild variant="outline" size="sm">
          <Link to="/dashboard">← Back to Overview</Link>
        </Button>
      </SlotInject>

      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-3xl tracking-tight text-foreground">
              UI State Validation
            </h1>
            <Badge variant="outline" className="hidden sm:inline-flex">
              Milestone A5.6
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Exhaustive validation screen confirming every async feature explicitly renders Loading,
            Skeleton, Empty, Error, and Success states.
          </p>
        </div>
      </div>

      {/* Global Simulation Controller */}
      <Card className="border-primary/20 bg-muted/20" data-testid="simulation-controller">
        <CardHeader className="pb-3">
          <CardTitle className="font-semibold text-base text-foreground">
            Global State Simulation Controller
          </CardTitle>
          <CardDescription>
            Applies the selected state to all async sections simultaneously. Each section below
            independently demonstrates the full 4-State UI Contract.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SimulationController
            current={globalState}
            onChange={setGlobalState}
            label="All Sections"
          />
        </CardContent>
      </Card>

      {/* ── Section 1: StateView Primitive ──────────────────────────────── */}
      <section aria-label="StateView Primitive Validation">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Section 1 — StateView Primitive
        </p>
        <StateViewShowcasePanel simulationState={globalState} />
      </section>

      {/* ── Section 2: Dashboard Metrics (reused from A5.2) ─────────────── */}
      <section aria-label="Dashboard Metrics State Validation">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Section 2 — Dashboard Metrics (useDashboardMetrics)
        </p>
        <DashboardMetricsSection
          simulationState={globalState}
          onRetry={() => setGlobalState('success')}
        />
      </section>

      {/* ── Section 3: Dashboard Activities (reused from A5.2) ──────────── */}
      <section aria-label="Dashboard Activities State Validation">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Section 3 — Dashboard Activities (useDashboardActivities)
        </p>
        <DashboardActivitySection
          simulationState={globalState}
          onRetry={() => setGlobalState('success')}
        />
      </section>

      {/* ── Section 4: Settings Profile (new in A5.6) ───────────────────── */}
      <section aria-label="Settings Profile State Validation">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Section 4 — Settings Profile (useUserProfileQuery + StateView)
        </p>
        <SettingsProfileSection simulationState={globalState} />
      </section>

      {/* ── Section 5: A6 Shared Infrastructure Integration (A6.8) ──────── */}
      <section aria-label="Step A6.8 Shared Infrastructure Integration">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Section 5 — Step A6.8 Shared Infrastructure Integration
        </p>
        <InfrastructureIntegrationPanel />
      </section>
    </div>
  );
};
