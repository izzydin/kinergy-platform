import React from 'react';
import {
  CheckCircle2,
  Clock,
  Loader2,
  AlertTriangle,
  Ban,
  FileCheck,
  HelpCircle,
} from 'lucide-react';
import { Badge } from '@kinergy-platform/ui';
import type { IngestionStatus } from '../types/knowledge-contract.types';

export interface IngestionStatusBadgeProps {
  readonly status?: IngestionStatus | string | null;
  readonly className?: string;
  readonly showIcon?: boolean;
}

interface StatusConfig {
  label: string;
  badgeClass: string;
  icon: React.ComponentType<{ className?: string }>;
  animate?: boolean;
}

const STATUS_CONFIGS: Record<IngestionStatus, StatusConfig> = {
  READY: {
    label: 'Indexado',
    badgeClass: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/25 dark:text-emerald-300',
    icon: CheckCircle2,
  },
  INDEXING: {
    label: 'Indexando',
    badgeClass: 'bg-blue-500/10 text-blue-700 border-blue-500/25 dark:text-blue-300',
    icon: Loader2,
    animate: true,
  },
  PROCESSING: {
    label: 'Procesando',
    badgeClass: 'bg-sky-500/10 text-sky-700 border-sky-500/25 dark:text-sky-300',
    icon: Loader2,
    animate: true,
  },
  VALIDATING: {
    label: 'Validando',
    badgeClass: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/25 dark:text-indigo-300',
    icon: Clock,
  },
  UPLOADED: {
    label: 'En cola',
    badgeClass: 'bg-amber-500/10 text-amber-700 border-amber-500/25 dark:text-amber-300',
    icon: Clock,
  },
  FAILED: {
    label: 'Error',
    badgeClass: 'bg-rose-500/10 text-rose-700 border-rose-500/25 dark:text-rose-300',
    icon: AlertTriangle,
  },
  CANCELLED: {
    label: 'Cancelado',
    badgeClass: 'bg-muted text-muted-foreground border-border/60',
    icon: Ban,
  },
};

/**
 * Accessible status badge indicating document RAG ingestion lifecycle state.
 * Clarifies the distinction between storage upload and semantic indexing.
 * Safely falls back for unrecognized future statuses without assuming success.
 */
export const IngestionStatusBadge: React.FC<IngestionStatusBadgeProps> = ({
  status,
  className = '',
  showIcon = true,
}) => {
  if (!status) {
    return (
      <Badge
        variant="outline"
        role="status"
        aria-label="Estado de indexación: Desconocido"
        data-testid="ingestion-status-unknown"
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium bg-muted text-muted-foreground border-border/60 ${className}`}
      >
        <FileCheck className="h-3 w-3" />
        <span>Subido</span>
      </Badge>
    );
  }

  const isKnown = (status as IngestionStatus) in STATUS_CONFIGS;
  const config: StatusConfig = isKnown
    ? STATUS_CONFIGS[status as IngestionStatus]
    : {
        label: status || 'Desconocido',
        badgeClass: 'bg-muted text-muted-foreground border-border/60',
        icon: HelpCircle,
        animate: false,
      };

  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      role="status"
      data-testid={`ingestion-status-${status.toLowerCase()}`}
      aria-label={`Estado de indexación: ${config.label}`}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${config.badgeClass} ${className}`}
    >
      {showIcon && (
        <Icon
          className={`h-3 w-3 shrink-0 ${config.animate ? 'motion-safe:animate-spin' : ''}`}
          aria-hidden="true"
        />
      )}
      <span>{config.label}</span>
    </Badge>
  );
};
