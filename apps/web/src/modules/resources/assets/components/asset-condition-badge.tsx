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
            'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium',
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
            'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300 font-medium',
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
            'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-medium',
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
            'border-orange-500/30 bg-orange-500/15 text-orange-700 dark:text-orange-300 font-medium',
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
