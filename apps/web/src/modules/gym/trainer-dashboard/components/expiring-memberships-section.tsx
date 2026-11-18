import React from 'react';
import { Link } from 'react-router-dom';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Badge,
  Spinner,
} from '@kinergy-platform/ui';
import { ExpiringMembershipItemVM } from '../types';

interface ExpiringMembershipsSectionProps {
  expiringItems: ExpiringMembershipItemVM[];
  totalExpiring: number;
  horizonDays: number;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onSelectClient?: (clientId: string) => void;
}

export const ExpiringMembershipsSection: React.FC<ExpiringMembershipsSectionProps> = ({
  expiringItems,
  totalExpiring,
  horizonDays,
  isLoading,
  isError,
  onRetry,
  onSelectClient,
}) => {
  return (
    <Card
      className="border border-border bg-card shadow-sm"
      data-testid="expiring-memberships-section"
    >
      <CardHeader className="p-4 border-b border-border flex flex-row items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="text-amber-500 font-bold" aria-hidden="true">
            ⏳
          </span>
          <CardTitle className="text-base font-bold text-foreground">
            Expiring Soon (Next {horizonDays} Days)
          </CardTitle>
          <Badge variant="secondary" size="sm">
            {totalExpiring}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {isLoading ? (
          <div className="py-6 flex items-center justify-center space-x-2 text-muted-foreground">
            <Spinner size="sm" />
            <span className="text-xs">Loading expiring memberships...</span>
          </div>
        ) : isError ? (
          <div className="py-4 text-center">
            <p className="text-xs text-destructive mb-2">Failed to load expiring memberships.</p>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          </div>
        ) : expiringItems.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground">
            <p className="text-sm font-medium">No memberships expiring soon</p>
            <p className="text-xs mt-1">
              All assigned client passes are currently in good standing.
            </p>
          </div>
        ) : (
          <div className="space-y-3" role="list" aria-label="Expiring Memberships List">
            {expiringItems.map((item) => (
              <div
                key={item.membershipId}
                role="listitem"
                className="p-3 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-lg flex items-center justify-between transition-all hover:bg-amber-50 dark:hover:bg-amber-950/40"
              >
                <div className="min-w-0 pr-3">
                  <div className="flex items-center space-x-2">
                    <Link
                      to={`/clients/${item.clientId}`}
                      className="font-semibold text-sm text-foreground hover:underline focus:outline-none focus:ring-1 focus:ring-amber-500 rounded truncate"
                    >
                      Client ID: {item.clientId}
                    </Link>
                    <Badge variant="outline" size="sm">
                      {item.daysRemaining === 0
                        ? 'Expires Today'
                        : `${item.daysRemaining}d remaining`}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    Plan: <span className="font-medium text-foreground">{item.planName}</span> •{' '}
                    <Link
                      to={`/gym/memberships/${item.membershipId}`}
                      className="hover:underline text-muted-foreground hover:text-foreground"
                    >
                      Mem: {item.membershipId}
                    </Link>{' '}
                    • Ends: {new Date(item.endDate).toLocaleDateString()}
                  </p>
                </div>
                {onSelectClient && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/60 flex-shrink-0"
                    onClick={() => onSelectClient(item.clientId)}
                  >
                    View Details
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
