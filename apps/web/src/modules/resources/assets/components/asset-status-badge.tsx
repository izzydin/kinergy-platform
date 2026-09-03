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
            'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-medium',
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
            'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300 font-medium',
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
            'border-rose-500/30 bg-rose-500/15 text-rose-700 dark:text-rose-300 font-medium',
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
          className={cn(
            'border-slate-500/30 bg-slate-500/15 text-slate-700 dark:text-slate-400 font-medium',
            className,
          )}
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
