import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kinergy-platform/ui';

import { useNotification } from '../../../app/providers/notification-provider';
import { httpClient, useStandardMutation } from '../../../shared/api';
import { authTokenStore } from '../../../shared/auth';
import { logger } from '../../../shared/logger/platform-logger';
import { ErrorBoundary } from '../../../shared/ui/error-boundary';

const log = logger.withContext('InfrastructureIntegrationPanel');

// ─────────────────────────────────────────────────────────────────────────────
// Uncaught Crash Component for ErrorBoundary Validation
// ─────────────────────────────────────────────────────────────────────────────

const CrashTriggerComponent: React.FC = () => {
  const [shouldCrash, setShouldCrash] = useState(false);

  if (shouldCrash) {
    log.error('Triggering intentional rendering crash inside ErrorBoundary');
    throw new Error('Simulated uncaught React rendering crash — ErrorBoundary validation.');
  }

  return (
    <Button
      variant="destructive"
      size="sm"
      onClick={() => setShouldCrash(true)}
      data-testid="trigger-crash-btn"
    >
      Trigger Rendering Crash
    </Button>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Infrastructure Integration Showcase Component
// ─────────────────────────────────────────────────────────────────────────────

export const InfrastructureIntegrationPanel: React.FC = () => {
  const notify = useNotification();
  const [simulateFailure, setSimulateFailure] = useState(false);

  // 1. Live Query state for Optimistic Update & Rollback testing
  const { data: optimisticData } = useQuery({
    queryKey: ['infrastructure', 'optimistic-test'],
    queryFn: () => Promise.resolve({ status: 'Original Cache Value', count: 10 }),
    initialData: { status: 'Original Cache Value', count: 10 },
  });

  // 2. Standard Mutation Pipeline: Success Case
  const successMutation = useStandardMutation({
    mutationFn: () =>
      httpClient.post<{ status: string; id: string }>('/api/v1/test/mutation-success'),
    notifications: {
      success: 'Standard Mutation succeeded cleanly via API Client',
    },
    loggerContext: 'SuccessMutationTest',
  });

  // 3. Standard Mutation Pipeline: Failure & Error Normalization Case
  const failureMutation = useStandardMutation({
    mutationFn: () => httpClient.post('/api/v1/test/mutation-failure'),
    notifications: {
      error: (err) => ({
        title: 'Mutation Failed',
        description: err.message,
      }),
    },
    loggerContext: 'FailureMutationTest',
  });

  // 4. Standard Mutation Pipeline: Opt-in Optimistic Update & Automatic Rollback
  const optimisticMutation = useStandardMutation({
    mutationFn: async () => {
      if (simulateFailure) {
        throw new Error('Simulated backend error triggering automatic rollback');
      }
      return httpClient.post<{ status: string }>('/api/v1/test/mutation-success');
    },
    optimistic: {
      queryKey: ['infrastructure', 'optimistic-test'],
      update: (current: unknown) => ({
        status: 'Optimistically Updated Value',
        count:
          current && typeof current === 'object' && 'count' in current
            ? (current as { count: number }).count + 1
            : 1,
      }),
    },
    invalidates: [['infrastructure', 'optimistic-test']],
    notifications: {
      success: 'Optimistic update persisted cleanly',
      error: 'Optimistic update failed — Cache automatically rolled back',
    },
    loggerContext: 'OptimisticMutationTest',
  });

  // 5. Auth Transport Interceptor Test (401 Response)
  const triggerAuthFailure = async () => {
    try {
      notify.info('Simulating 401 Unauthorized API response...');
      await httpClient.post('/api/v1/test/auth-failure');
    } catch {
      // Handled by AuthTransport interceptor
    }
  };

  return (
    <Card className="w-full border-primary/30 bg-card shadow-sm" data-testid="infrastructure-panel">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="font-bold text-xl text-foreground">
              Step A6.8 — Shared Infrastructure Integration
            </CardTitle>
            <CardDescription>
              Live composition verifying Environment, API Client, Logger, Notification Service,
              Error Boundaries, Auth Transport, and Standard Mutation Pipeline.
            </CardDescription>
          </div>
          <Badge variant="default">Integrated Pipeline</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* ── Sub-Panel 1: Standard Mutation Pipeline ────────────────────── */}
        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            1. Standard Mutation Pipeline & Error Normalization
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              variant="default"
              onClick={() => successMutation.mutate()}
              disabled={successMutation.isPending}
              data-testid="mutation-success-btn"
            >
              {successMutation.isPending ? 'Executing...' : 'Trigger Mutation Success'}
            </Button>

            <Button
              size="sm"
              variant="destructive"
              onClick={() => failureMutation.mutate()}
              disabled={failureMutation.isPending}
              data-testid="mutation-failure-btn"
            >
              {failureMutation.isPending ? 'Executing...' : 'Trigger Mutation Failure'}
            </Button>
          </div>
        </div>

        {/* ── Sub-Panel 2: Opt-in Optimistic Update & Automatic Rollback ─── */}
        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              2. Optimistic Update & Automatic Rollback
            </p>
            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={simulateFailure}
                onChange={(e) => setSimulateFailure(e.target.checked)}
                className="rounded border-border"
                data-testid="simulate-failure-checkbox"
              />
              Simulate Server Failure
            </label>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-background p-3 rounded border border-border">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Cache Value:</p>
              <p
                className="text-sm font-semibold text-foreground"
                data-testid="optimistic-cache-val"
              >
                {optimisticData?.status} (Count: {optimisticData?.count})
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => optimisticMutation.mutate()}
              disabled={optimisticMutation.isPending}
              data-testid="optimistic-mutation-btn"
            >
              Execute Optimistic Mutation
            </Button>
          </div>
        </div>

        {/* ── Sub-Panel 3: Notification Infrastructure ─────────────────────── */}
        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            3. Notification Provider & Toast Dispatcher
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => notify.success('Success Toast', 'Action completed without error.')}
              data-testid="toast-success-btn"
            >
              Success Toast
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => notify.error('Error Toast', 'Operation failed to complete.')}
              data-testid="toast-error-btn"
            >
              Error Toast
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => notify.warning('Warning Toast', 'High latency detected on network.')}
              data-testid="toast-warning-btn"
            >
              Warning Toast
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => notify.info('Info Toast', 'New telemetry batch processed.')}
              data-testid="toast-info-btn"
            >
              Info Toast
            </Button>
          </div>
        </div>

        {/* ── Sub-Panel 4: Error Boundary & Auth Transport ─────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              4. Module Error Boundary Isolation
            </p>
            <ErrorBoundary name="ValidationBoundary">
              <CrashTriggerComponent />
            </ErrorBoundary>
          </div>

          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              5. Auth Transport Infrastructure
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={triggerAuthFailure}
                data-testid="auth-failure-btn"
              >
                Simulate 401 Response
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  authTokenStore.clearSession();
                  notify.info('Logged out — In-memory tokens cleared');
                }}
                data-testid="auth-logout-btn"
              >
                Clear Tokens
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
