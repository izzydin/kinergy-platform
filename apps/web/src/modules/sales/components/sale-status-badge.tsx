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
          className={`inline-flex items-center gap-1 border-status-warning-border bg-status-warning-surface text-status-warning ${className ?? ''}`}
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
          className={`inline-flex items-center gap-1 border-status-info-border bg-status-info-surface text-status-info ${className ?? ''}`}
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
          className={`inline-flex items-center gap-1 border-status-success-border bg-status-success-surface text-status-success font-medium ${className ?? ''}`}
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
          className={`inline-flex items-center gap-1 border-status-success-border bg-status-success-surface text-status-success font-medium ${className ?? ''}`}
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
          className={`inline-flex items-center gap-1 border-border bg-muted text-muted-foreground ${className ?? ''}`}
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
