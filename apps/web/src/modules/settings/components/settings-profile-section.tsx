import React from 'react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  StateView,
} from '@kinergy-platform/ui';
import { useUserProfileQuery } from '../api/settings-queries';

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton Fallback
//
// Layout-matching skeleton rendered during the isLoading state.
// Eliminates cumulative layout shift (CLS) by preserving the exact
// card dimensions before data arrives.
// ─────────────────────────────────────────────────────────────────────────────

const SettingsProfileSkeleton: React.FC = () => (
  <div className="space-y-4 p-1" data-testid="profile-loading">
    <div className="flex items-center gap-4">
      <Skeleton className="h-14 w-14 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-56" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
    <Skeleton className="h-px w-full" />
    <div className="flex items-center justify-between">
      <Skeleton className="h-5 w-32 rounded-full" />
      <Skeleton className="h-8 w-24 rounded-md" />
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export interface SettingsProfileSectionProps {
  /** Optional override for test/simulation purposes */
  readonly simulationState?: 'success' | 'loading' | 'empty' | 'error';
}

/**
 * SettingsProfileSection
 *
 * Demonstrates the mandatory 4-State UI Contract (ADR-FE-0023) for the
 * authenticated user profile endpoint:
 *
 *  1. Loading  → <SettingsProfileSkeleton /> — layout-preserving placeholder
 *  2. Error    → <StateView isError> — destructive alert with retry
 *  3. Empty    → <StateView isEmpty> — graceful empty state with CTA
 *  4. Success  → Populated profile card
 *
 * Uses the shared <StateView /> primitive from @kinergy-platform/ui to avoid
 * duplicating state rendering logic across domain modules.
 */
export const SettingsProfileSection: React.FC<SettingsProfileSectionProps> = ({
  simulationState,
}) => {
  const { data: profile, isLoading, isError, error, refetch } = useUserProfileQuery();

  // When simulationState is explicitly provided (dev panel / test harness),
  // derive effective flags PURELY from the override — do NOT mix with TanStack
  // Query flags. This prevents the query's isLoading from masking an explicit
  // error or empty simulation (StateView priority: loading > error > empty).
  const effectiveLoading = simulationState ? simulationState === 'loading' : isLoading;
  const effectiveError = simulationState ? simulationState === 'error' : isError;
  const effectiveEmpty = simulationState
    ? simulationState === 'empty'
    : !effectiveLoading && !effectiveError && !profile;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Authenticated User Profile</CardTitle>
            <CardDescription>
              Demonstrates async 4-State Contract (Loading/Skeleton, Error, Empty, Success) via
              useUserProfileQuery + StateView.
            </CardDescription>
          </div>
          <Badge variant="secondary">A5.6 Profile State</Badge>
        </div>
      </CardHeader>

      <CardContent>
        <StateView
          isLoading={effectiveLoading}
          loadingFallback={<SettingsProfileSkeleton />}
          isError={effectiveError}
          errorMessage={error?.message ?? 'Failed to load user profile from settings service.'}
          onRetry={() => void refetch()}
          isEmpty={effectiveEmpty}
          emptyTitle="No Profile Found"
          emptyDescription="No authenticated user profile is associated with this session context."
          emptyAction={
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry Profile Fetch
            </Button>
          }
        >
          {/* 4. SUCCESS STATE — rendered by StateView when all guards pass */}
          {profile && (
            <div
              className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
              data-testid="profile-success"
            >
              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14">
                  <AvatarImage src={profile.avatarUrl ?? undefined} alt={profile.displayName} />
                  <AvatarFallback className="font-bold text-lg">
                    {profile.displayName
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div className="space-y-1">
                  <p className="font-semibold text-foreground text-sm">{profile.displayName}</p>
                  <p className="text-xs text-muted-foreground">{profile.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Member since:{' '}
                    {new Date(profile.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                    })}
                  </p>
                </div>
              </div>

              <Badge variant="default" className="shrink-0">
                {profile.role}
              </Badge>
            </div>
          )}
        </StateView>
      </CardContent>
    </Card>
  );
};
