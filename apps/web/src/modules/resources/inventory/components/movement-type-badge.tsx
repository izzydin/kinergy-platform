import React from 'react';
import { Badge } from '@kinergy-platform/ui';
import { StockMovementType } from '../types';

export interface MovementTypeBadgeProps {
  type: StockMovementType;
  className?: string;
}

export const MovementTypeBadge: React.FC<MovementTypeBadgeProps> = ({ type, className }) => {
  switch (type) {
    case StockMovementType.PURCHASE:
      return (
        <Badge variant="default" className={className}>
          Purchase (+)
        </Badge>
      );
    case StockMovementType.SALE:
      return (
        <Badge variant="secondary" className={className}>
          Retail Sale (-)
        </Badge>
      );
    case StockMovementType.CONSUMPTION:
      return (
        <Badge variant="secondary" className={className}>
          Treatment (-)
        </Badge>
      );
    case StockMovementType.ADJUSTMENT_IN:
      return (
        <Badge variant="default" className={className}>
          Audit In (+)
        </Badge>
      );
    case StockMovementType.ADJUSTMENT_OUT:
      return (
        <Badge variant="destructive" className={className}>
          Audit Out (-)
        </Badge>
      );
    case StockMovementType.SCRAP:
      return (
        <Badge variant="destructive" className={className}>
          Scrapped (-)
        </Badge>
      );
    case StockMovementType.CORRECTION:
      return (
        <Badge variant="outline" className={className}>
          Reconciled (±)
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className={className}>
          {type}
        </Badge>
      );
  }
};
