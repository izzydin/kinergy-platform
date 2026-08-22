import React from 'react';
import { Card, CardContent, Badge, Button } from '@kinergy-platform/ui';
import { AssignedClientMembershipVM } from '../types';
import { ExpiringMembershipBadge } from './expiring-membership-badge';

interface AssignedClientCardProps {
  readonly client: AssignedClientMembershipVM;
  readonly onSelectClient?: (clientId: string) => void;
  readonly isSelected?: boolean;
}

export const AssignedClientCard: React.FC<AssignedClientCardProps> = ({
  client,
  onSelectClient,
  isSelected = false,
}) => {
  const getStatusBadge = (status: string) => {
    switch (status.toUpperCase()) {
      case 'ACTIVE':
        return (
          <Badge
            variant="default"
            className="bg-emerald-600/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-medium"
          >
            ACTIVE
          </Badge>
        );
      case 'FROZEN':
        return (
          <Badge
            variant="secondary"
            className="bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 text-[10px] font-medium"
          >
            FROZEN
          </Badge>
        );
      case 'PENDING':
        return (
          <Badge
            variant="outline"
            className="text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] font-medium"
          >
            PENDING
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-[10px]">
            {status}
          </Badge>
        );
    }
  };

  return (
    <Card
      className={`transition-all duration-200 hover:shadow-md cursor-pointer border ${
        isSelected
          ? 'border-primary ring-1 ring-primary/40 bg-primary/5'
          : 'border-border/80 hover:border-primary/40 bg-card'
      }`}
      onClick={() => onSelectClient?.(client.clientId)}
      data-testid={`assigned-client-card-${client.clientId}`}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-sm text-foreground truncate">
                Client ID: {client.clientId}
              </span>
              {getStatusBadge(client.status)}
            </div>
            <p className="text-xs text-muted-foreground truncate font-medium">
              Plan: {client.planName}
            </p>
          </div>
          <ExpiringMembershipBadge
            daysRemaining={client.daysRemaining}
            isExpiringSoon={client.isExpiringSoon}
            isExpired={client.isExpired}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px] bg-muted/30 p-2.5 rounded-md border border-border/40">
          <div>
            <span className="text-muted-foreground block">Validity End</span>
            <span className="font-mono text-foreground font-medium">
              {new Date(client.endDate).toLocaleDateString()}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block">Assigned Since</span>
            <span className="font-mono text-foreground font-medium">
              {new Date(client.assignedAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        {client.isCurrentlyFrozen && (
          <div className="text-[11px] text-sky-600 dark:text-sky-400 bg-sky-500/10 px-2 py-1 rounded border border-sky-500/20 flex items-center gap-1.5">
            <span>❄️ Currently on freeze period</span>
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button
            variant={isSelected ? 'default' : 'outline'}
            size="sm"
            className="text-xs h-7 px-2.5"
            onClick={(e) => {
              e.stopPropagation();
              onSelectClient?.(client.clientId);
            }}
          >
            {isSelected ? 'Viewing Eligibility' : 'Check Status'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
