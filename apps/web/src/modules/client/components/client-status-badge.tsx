import React from 'react';
import { Badge } from '@kinergy-platform/ui';
import { CheckCircle2, Archive } from 'lucide-react';
import type { ClientStatus } from '../types/client.types';

export interface ClientStatusBadgeProps {
  status: ClientStatus;
  className?: string;
}

export const ClientStatusBadge: React.FC<ClientStatusBadgeProps> = ({ status, className }) => {
  switch (status) {
    case 'ACTIVE':
      return (
        <Badge
          variant="default"
          className={`inline-flex items-center gap-1 border-emerald-500/30 bg-emerald-600/20 text-emerald-600 dark:text-emerald-400 ${className ?? ''}`}
          aria-label="Client status: Active"
        >
          <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>Active</span>
        </Badge>
      );
    case 'ARCHIVED':
      return (
        <Badge
          variant="secondary"
          className={`inline-flex items-center gap-1 border-muted bg-muted text-muted-foreground ${className ?? ''}`}
          aria-label="Client status: Archived"
        >
          <Archive className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>Archived</span>
        </Badge>
      );
    default:
      return (
        <Badge
          variant="outline"
          className={`inline-flex items-center gap-1 ${className ?? ''}`}
          aria-label={`Client status: ${status}`}
        >
          <span>{status}</span>
        </Badge>
      );
  }
};
