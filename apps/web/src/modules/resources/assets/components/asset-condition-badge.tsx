import React from 'react';
import { Badge } from '@kinergy-platform/ui';
import { AssetCondition } from '../types';
import { cn } from '../../../../shared/lib/utils';

export interface AssetConditionBadgeProps {
  condition: AssetCondition;
  showRank?: boolean;
  className?: string;
}

export const AssetConditionBadge: React.FC<AssetConditionBadgeProps> = ({
  condition,
  showRank = false,
  className,
}) => {
  switch (condition) {
    case AssetCondition.EXCELLENT:
      return (
        <Badge
          variant="outline"
          className={cn(
            'border-status-success-border bg-status-success-surface text-status-success font-medium',
            className,
          )}
        >
          {showRank ? 'Rank 1 • Excellent' : 'Excellent'}
        </Badge>
      );
    case AssetCondition.GOOD:
      return (
        <Badge
          variant="outline"
          className={cn(
            'border-status-info-border bg-status-info-surface text-status-info font-medium',
            className,
          )}
        >
          {showRank ? 'Rank 2 • Good' : 'Good'}
        </Badge>
      );
    case AssetCondition.FAIR:
      return (
        <Badge
          variant="outline"
          className={cn(
            'border-status-warning-border bg-status-warning-surface text-status-warning font-medium',
            className,
          )}
        >
          {showRank ? 'Rank 3 • Fair' : 'Fair'}
        </Badge>
      );
    case AssetCondition.NEEDS_REPAIR:
      return (
        <Badge
          variant="outline"
          className={cn(
            'border-status-warning-border bg-status-warning-surface text-status-warning font-medium',
            className,
          )}
        >
          {showRank ? 'Rank 4 • Needs Repair' : 'Needs Repair'}
        </Badge>
      );
    case AssetCondition.OUT_OF_SERVICE:
      return (
        <Badge variant="destructive" className={cn('font-semibold shadow-xs', className)}>
          {showRank ? 'Rank 5 • Out of Service' : 'Out of Service'}
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className={className}>
          {condition}
        </Badge>
      );
  }
};
