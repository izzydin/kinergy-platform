import React from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Alert,
  Spinner,
} from '@kinergy-platform/ui';
import { useClientEligibility } from '../hooks/use-attendance';
import { MembershipEligibilityOutcome } from '../types';

interface MembershipEligibilityCardProps {
  readonly clientId: string;
}

export const MembershipEligibilityCard: React.FC<MembershipEligibilityCardProps> = ({
  clientId,
}) => {
  const { data: eligibility, isLoading, error } = useClientEligibility(clientId);

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardContent className="p-6 flex flex-col items-center justify-center space-y-2">
          <Spinner size="md" />
          <p className="text-xs text-muted-foreground">
            Evaluating backend membership eligibility...
          </p>
        </CardContent>
      </Card>
    );
  }

  if (error || !eligibility) {
    return (
      <Card className="w-full border-destructive/50">
        <CardContent className="p-4">
          <Alert variant="destructive">
            Failed to evaluate membership eligibility: {error?.message ?? 'Unknown error'}
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const getStatusBadge = () => {
    switch (eligibility.outcome) {
      case MembershipEligibilityOutcome.ELIGIBLE:
        return (
          <Badge
            variant="default"
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-2.5 py-1"
            data-testid="eligibility-status-badge"
          >
            ✓ ELIGIBLE TO ENTER
          </Badge>
        );
      case MembershipEligibilityOutcome.EXPIRED:
        return (
          <Badge
            variant="destructive"
            className="text-xs px-2.5 py-1"
            data-testid="eligibility-status-badge"
          >
            ✕ MEMBERSHIP EXPIRED
          </Badge>
        );
      case MembershipEligibilityOutcome.FROZEN:
        return (
          <Badge
            variant="secondary"
            className="bg-amber-100 text-amber-900 border border-amber-300 text-xs px-2.5 py-1"
            data-testid="eligibility-status-badge"
          >
            ❄ MEMBERSHIP FROZEN
          </Badge>
        );
      case MembershipEligibilityOutcome.NO_MEMBERSHIP:
        return (
          <Badge
            variant="destructive"
            className="text-xs px-2.5 py-1"
            data-testid="eligibility-status-badge"
          >
            ✕ NO ACTIVE MEMBERSHIP
          </Badge>
        );
      case MembershipEligibilityOutcome.NOT_YET_ACTIVE:
        return (
          <Badge
            variant="outline"
            className="text-xs px-2.5 py-1"
            data-testid="eligibility-status-badge"
          >
            ⏳ NOT YET ACTIVE
          </Badge>
        );
      case MembershipEligibilityOutcome.CANCELLED:
      case MembershipEligibilityOutcome.TERMINATED:
      case MembershipEligibilityOutcome.INACTIVE_CLIENT:
      default:
        return (
          <Badge
            variant="destructive"
            className="text-xs px-2.5 py-1"
            data-testid="eligibility-status-badge"
          >
            ✕ INELIGIBLE ({eligibility.outcome})
          </Badge>
        );
    }
  };

  return (
    <Card
      className="w-full bg-card shadow-sm border-border/80"
      data-testid="membership-eligibility-card"
    >
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-foreground tracking-tight">
            Authoritative Membership Status
          </CardTitle>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-3.5">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="bg-muted/40 p-2.5 rounded-md border border-border/40">
            <span className="text-muted-foreground block mb-0.5">Membership ID</span>
            <span className="font-mono font-medium text-foreground">
              {eligibility.membershipId ?? 'None on record'}
            </span>
          </div>
          <div className="bg-muted/40 p-2.5 rounded-md border border-border/40">
            <span className="text-muted-foreground block mb-0.5">Plan Code</span>
            <span className="font-mono font-medium text-foreground">
              {eligibility.planId ?? 'N/A'}
            </span>
          </div>
        </div>

        {eligibility.period && (
          <div className="p-2.5 rounded-md bg-muted/20 border border-border/30 text-xs">
            <span className="text-muted-foreground block mb-1">Contract Validity Window</span>
            <span className="font-mono text-foreground font-medium">
              {new Date(eligibility.period.startDate).toLocaleDateString()} &rarr;{' '}
              {new Date(eligibility.period.endDate).toLocaleDateString()}
            </span>
          </div>
        )}

        {!eligibility.isEligible && eligibility.reason && (
          <Alert variant="destructive" className="text-xs py-2">
            <strong>Denial Reason:</strong> {eligibility.reason}
          </Alert>
        )}

        <div className="text-[11px] text-muted-foreground/80 flex items-center justify-between pt-1 border-t border-border/30">
          <span>Evaluated: {new Date(eligibility.evaluatedAt).toLocaleTimeString()}</span>
          <span>Source: Gym Management Engine</span>
        </div>
      </CardContent>
    </Card>
  );
};
