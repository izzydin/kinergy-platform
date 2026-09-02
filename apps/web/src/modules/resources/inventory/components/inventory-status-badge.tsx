import React from 'react';
import { Badge } from '@kinergy-platform/ui';
import { InventoryItemStatus } from '../types';

export interface InventoryStatusBadgeProps {
  status: InventoryItemStatus;
  className?: string;
}

export const InventoryStatusBadge: React.FC<InventoryStatusBadgeProps> = ({
  status,
  className,
}) => {
  switch (status) {
    case InventoryItemStatus.ACTIVE:
      return (
        <Badge variant="default" className={className}>
          Active
        </Badge>
      );
    case InventoryItemStatus.INACTIVE:
      return (
        <Badge variant="secondary" className={className}>
          Suspended
        </Badge>
      );
    case InventoryItemStatus.ARCHIVED:
      return (
        <Badge variant="outline" className={className}>
          Archived
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
