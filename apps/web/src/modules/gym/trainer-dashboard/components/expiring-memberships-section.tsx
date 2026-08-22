import React from 'react';
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
    <Card className="border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 shadow-sm">
      <CardHeader className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-row items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="text-amber-500 font-bold" aria-hidden="true">
            ⏳
          </span>
          <CardTitle className="text-base font-bold text-slate-900 dark:text-white">
            Expiring Soon (Next {horizonDays} Days)
          </CardTitle>
          <Badge variant="secondary" size="sm">
            {totalExpiring}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {isLoading ? (
          <div className="py-6 flex items-center justify-center space-x-2 text-slate-500">
            <Spinner size="sm" />
            <span className="text-xs">Loading expiring memberships...</span>
          </div>
        ) : isError ? (
          <div className="py-4 text-center">
            <p className="text-xs text-red-600 dark:text-red-400 mb-2">
              Failed to load expiring memberships.
            </p>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          </div>
        ) : expiringItems.length === 0 ? (
          <div className="py-6 text-center text-slate-500 dark:text-slate-400">
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
                    <span className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                      Client ID: {item.clientId}
                    </span>
                    <Badge variant="outline" size="sm">
                      {item.daysRemaining === 0
                        ? 'Expires Today'
                        : `${item.daysRemaining}d remaining`}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 truncate">
                    Plan:{' '}
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {item.planName}
                    </span>{' '}
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
