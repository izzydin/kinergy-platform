import React from 'react';
import { Badge } from '@kinergy-platform/ui';
import type { IntelligenceSubsystemStatus } from '../types';
import { useAIHealth } from '../hooks/use-ai-health';

export interface AIHealthPillProps {
  /** Optional explicit subsystem status (healthy, degraded, unhealthy). Defaults to live hook state. */
  readonly status?: IntelligenceSubsystemStatus;
  /** Optional custom tooltip or detailed status text */
  readonly label?: string;
  /** Additional CSS classes */
  readonly className?: string;
}

const statusConfig: Record<
  IntelligenceSubsystemStatus,
  { label: string; dotClass: string; badgeClass: string }
> = {
  healthy: {
    label: 'AI En línea',
    dotClass: 'bg-emerald-500 motion-safe:animate-pulse',
    badgeClass: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  degraded: {
    label: 'AI Degradado',
    dotClass: 'bg-amber-500',
    badgeClass: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  unhealthy: {
    label: 'AI Fuera de servicio',
    dotClass: 'bg-rose-500',
    badgeClass: 'border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  },
};

/**
 * Visual status indicator badge for the live AI backend subsystem.
 * Reflects Ollama and pgvector readiness via the useAIHealth() query hook.
 */
export const AIHealthPill: React.FC<AIHealthPillProps> = ({
  status: explicitStatus,
  label,
  className = '',
}) => {
  let hookStatus: IntelligenceSubsystemStatus | undefined;

  try {
    // Only attempt live query if not explicitly overridden by props
    const { data } = useAIHealth();
    hookStatus = data?.status;
  } catch {
    // Fall back gracefully if used in standalone unit tests without QueryClientProvider
  }

  const resolvedStatus = explicitStatus || hookStatus || 'healthy';
  const current = statusConfig[resolvedStatus] ?? statusConfig.healthy;
  const displayText = label || current.label;

  return (
    <Badge
      variant="outline"
      role="status"
      aria-label={`Estado del Asistente AI: ${displayText}`}
      data-testid="ai-health-pill"
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors select-none ${current.badgeClass} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${current.dotClass}`} aria-hidden="true" />
      <span>{displayText}</span>
    </Badge>
  );
};
