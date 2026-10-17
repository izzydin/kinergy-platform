import React from 'react';
import { Badge } from '@kinergy-platform/ui';
import type { PaymentStatus } from '../types/payments.types';

export interface PaymentStatusBadgeProps {
  status: PaymentStatus;
  className?: string;
}

export const PaymentStatusBadge: React.FC<PaymentStatusBadgeProps> = ({ status, className }) => {
  switch (status) {
    case 'PENDING':
      return (
        <Badge
          variant="outline"
          className={`border-amber-500/40 bg-amber-500/10 text-amber-500 dark:text-amber-400 ${className ?? ''}`}
        >
          Pending
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
    case 'FAILED':
      return (
        <Badge variant="destructive" className={className}>
          Failed
        </Badge>
      );
    case 'CANCELLED':
      return (
        <Badge variant="secondary" className={className}>
          Cancelled
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
