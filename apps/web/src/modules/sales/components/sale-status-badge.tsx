import React from 'react';
import { Badge } from '@kinergy-platform/ui';
import { FileText, Clock, Coins, CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import type { SaleStatus } from '../types/sales-query.types';

export interface SaleStatusBadgeProps {
  status: SaleStatus;
  className?: string;
}

export const SaleStatusBadge: React.FC<SaleStatusBadgeProps> = ({ status, className }) => {
  switch (status) {
    case 'DRAFT':
      return (
        <Badge
          variant="secondary"
          className={`inline-flex items-center gap-1 ${className ?? ''}`}
          aria-label="Sale status: Draft"
        >
          <FileText className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>Draft</span>
        </Badge>
      );
    case 'PENDING_PAYMENT':
      return (
        <Badge
          variant="outline"
          className={`inline-flex items-center gap-1 border-amber-500/40 bg-amber-500/10 text-amber-500 dark:text-amber-400 ${className ?? ''}`}
          aria-label="Sale status: Pending Payment"
        >
          <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>Pending Payment</span>
        </Badge>
      );
    case 'PARTIALLY_PAID':
      return (
        <Badge
          variant="outline"
          className={`inline-flex items-center gap-1 border-blue-500/40 bg-blue-500/10 text-blue-500 dark:text-blue-400 ${className ?? ''}`}
          aria-label="Sale status: Partially Paid"
        >
          <Coins className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>Partially Paid</span>
        </Badge>
      );
    case 'PAID':
      return (
        <Badge
          variant="default"
          className={`inline-flex items-center gap-1 border-emerald-500/30 bg-emerald-600/20 text-emerald-600 dark:text-emerald-400 ${className ?? ''}`}
          aria-label="Sale status: Paid"
        >
          <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>Paid</span>
        </Badge>
      );
    case 'COMPLETED':
      return (
        <Badge
          variant="default"
          className={`inline-flex items-center gap-1 border-emerald-500/30 bg-emerald-600/20 text-emerald-600 dark:text-emerald-400 ${className ?? ''}`}
          aria-label="Sale status: Completed"
        >
          <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>Completed</span>
        </Badge>
      );
    case 'CANCELLED':
      return (
        <Badge
          variant="destructive"
          className={`inline-flex items-center gap-1 ${className ?? ''}`}
          aria-label="Sale status: Cancelled"
        >
          <XCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>Cancelled</span>
        </Badge>
      );
    case 'REFUNDED':
      return (
        <Badge
          variant="outline"
          className={`inline-flex items-center gap-1 border-purple-500/40 bg-purple-500/10 text-purple-500 dark:text-purple-400 ${className ?? ''}`}
          aria-label="Sale status: Refunded"
        >
          <RotateCcw className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>Refunded</span>
        </Badge>
      );
    default:
      return (
        <Badge
          variant="outline"
          className={`inline-flex items-center gap-1 ${className ?? ''}`}
          aria-label={`Sale status: ${status}`}
        >
          <span>{status}</span>
        </Badge>
      );
  }
};
