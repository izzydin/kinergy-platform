import React from 'react';
import { Badge } from '@kinergy-platform/ui';
import { Clock, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
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
          className={`inline-flex items-center gap-1 border-amber-500/40 bg-amber-500/10 text-amber-500 dark:text-amber-400 ${className ?? ''}`}
          aria-label="Payment status: Pending"
        >
          <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>Pending</span>
        </Badge>
      );
    case 'COMPLETED':
      return (
        <Badge
          variant="default"
          className={`inline-flex items-center gap-1 border-emerald-500/30 bg-emerald-600/20 text-emerald-600 dark:text-emerald-400 ${className ?? ''}`}
          aria-label="Payment status: Completed"
        >
          <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>Completed</span>
        </Badge>
      );
    case 'FAILED':
      return (
        <Badge
          variant="destructive"
          className={`inline-flex items-center gap-1 ${className ?? ''}`}
          aria-label="Payment status: Failed"
        >
          <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>Failed</span>
        </Badge>
      );
    case 'CANCELLED':
      return (
        <Badge
          variant="secondary"
          className={`inline-flex items-center gap-1 ${className ?? ''}`}
          aria-label="Payment status: Cancelled"
        >
          <XCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>Cancelled</span>
        </Badge>
      );
    default:
      return (
        <Badge
          variant="outline"
          className={`inline-flex items-center gap-1 ${className ?? ''}`}
          aria-label={`Payment status: ${status}`}
        >
          <span>{status}</span>
        </Badge>
      );
  }
};
