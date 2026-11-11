import React from 'react';
import { Badge } from '@kinergy-platform/ui';
import { AssetStatus } from '../types';
import { cn } from '../../../../shared/lib/utils';

export interface AssetStatusBadgeProps {
  status: AssetStatus;
  className?: string;
}

export const AssetStatusBadge: React.FC<AssetStatusBadgeProps> = ({ status, className }) => {
  switch (status) {
    case AssetStatus.ACTIVE:
      return (
        <Badge
          variant="outline"
          className={cn(
            'border-status-success-border bg-status-success-surface text-status-success font-medium',
            className,
          )}
        >
          Active
        </Badge>
      );
    case AssetStatus.UNDER_MAINTENANCE:
      return (
        <Badge
          variant="outline"
          className={cn(
            'border-status-warning-border bg-status-warning-surface text-status-warning font-medium',
            className,
          )}
        >
          Under Maintenance
        </Badge>
      );
    case AssetStatus.DAMAGED:
      return (
        <Badge
          variant="outline"
          className={cn(
            'border-status-danger-border bg-status-danger-surface text-status-danger font-medium',
            className,
          )}
        >
          Damaged
        </Badge>
      );
    case AssetStatus.RETIRED:
      return (
        <Badge
          variant="outline"
          className={cn('border-border bg-muted text-muted-foreground font-medium', className)}
        >
          Retired
        </Badge>
      );
    case AssetStatus.SOLD:
      return (
        <Badge
          variant="secondary"
          className={cn(
            'border-muted-foreground/30 text-muted-foreground line-through font-normal',
            className,
          )}
        >
          Sold
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className={className}>
          {status}
        </Badge>
      );
  }
};
