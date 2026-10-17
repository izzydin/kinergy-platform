import React from 'react';
import { Badge } from '@kinergy-platform/ui';
import type { SaleStatus } from '../types/sales-query.types';

export interface SaleStatusBadgeProps {
  status: SaleStatus;
  className?: string;
}

export const SaleStatusBadge: React.FC<SaleStatusBadgeProps> = ({ status, className }) => {
  switch (status) {
    case 'DRAFT':
      return (
        <Badge variant="secondary" className={className}>
          Draft
        </Badge>
      );
    case 'PENDING_PAYMENT':
      return (
        <Badge
          variant="outline"
          className={`border-amber-500/40 bg-amber-500/10 text-amber-500 dark:text-amber-400 ${className ?? ''}`}
        >
          Pending Payment
        </Badge>
      );
    case 'PARTIALLY_PAID':
      return (
        <Badge
          variant="outline"
          className={`border-blue-500/40 bg-blue-500/10 text-blue-500 dark:text-blue-400 ${className ?? ''}`}
        >
          Partially Paid
        </Badge>
      );
    case 'PAID':
      return (
        <Badge
          variant="default"
          className={`border-emerald-500/30 bg-emerald-600/20 text-emerald-600 dark:text-emerald-400 ${className ?? ''}`}
        >
          Paid
        </Badge>
      );
    case 'COMPLETED':
      return (
        <Badge
          variant="default"
          className={`border-emerald-500/30 bg-emerald-600/20 text-emerald-600 dark:text-emerald-400 ${className ?? ''}`}
        >
          Completed
        </Badge>
      );
    case 'CANCELLED':
      return (
        <Badge variant="destructive" className={className}>
          Cancelled
        </Badge>
      );
    case 'REFUNDED':
      return (
        <Badge
          variant="outline"
          className={`border-purple-500/40 bg-purple-500/10 text-purple-500 dark:text-purple-400 ${className ?? ''}`}
        >
          Refunded
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
