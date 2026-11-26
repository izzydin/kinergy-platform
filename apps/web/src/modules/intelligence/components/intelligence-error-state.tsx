import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@kinergy-platform/ui';

export interface IntelligenceErrorStateProps {
  /** Error heading title (default: "Error en el módulo de Inteligencia") */
  readonly title?: string;
  /** Raw or normalized Error instance or error message string */
  readonly error?: Error | string | null;
  /** Optional error correlation or reference ID */
  readonly correlationId?: string;
  /** Callback executed when user clicks retry */
  readonly onRetry?: () => void;
  /** Custom label for retry button (default: "Reintentar") */
  readonly retryLabel?: string;
  /** Optional secondary action button */
  readonly secondaryAction?: React.ReactNode;
  /** Compact presentation for narrow drawers and sidebars */
  readonly compact?: boolean;
  /** Additional container CSS classes */
  readonly className?: string;
  /** Custom test identifier */
  readonly testId?: string;
}

/**
 * Sanitizes technical error messages to prevent leaking stack traces,
 * database internals, Prisma schema names, SQL fragments, or server tokens.
 */
export function sanitizeIntelligenceErrorMessage(rawError?: Error | string | null): string {
  if (!rawError) {
    return 'Ocurrió un error inesperado al procesar la solicitud. Por favor intenta de nuevo.';
  }

  const message = typeof rawError === 'string' ? rawError : rawError.message;

  const sensitivePatterns = [
    /prisma/i,
    /sql/i,
    /syntaxerror/i,
    /typeerror/i,
    /nullpointer/i,
    /database/i,
    /pgvector/i,
    /connection refused/i,
    /econnrefused/i,
    /stack\s*trace/i,
    /password/i,
    /bearer/i,
  ];

  const hasSensitiveDetails = sensitivePatterns.some((pattern) => pattern.test(message));
  if (hasSensitiveDetails) {
    return 'El servicio de Inteligencia experimentó un inconveniente temporal. Intenta nuevamente en unos instantes.';
  }

  return message;
}

/**
 * Reusable In-Place Recoverable Error Primitive for Kynergy Intelligence.
 *
 * Implements WCAG 2.2 AA error accessibility:
 * - `role="alert"` with `aria-live="assertive"`
 * - Focusable and keyboard-accessible retry button
 * - Defense in depth: Sanitize technical internals to protect operational security
 */
export const IntelligenceErrorState: React.FC<IntelligenceErrorStateProps> = ({
  title = 'Error en el módulo de Inteligencia',
  error,
  correlationId,
  onRetry,
  retryLabel = 'Reintentar',
  secondaryAction,
  compact = false,
  className = '',
  testId = 'intelligence-error-state',
}) => {
  const sanitizedMessage = sanitizeIntelligenceErrorMessage(error);

  return (
    <div
      role="alert"
      aria-live="assertive"
      data-testid={testId}
      className={`flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 text-center transition-colors min-w-0 ${
        compact ? 'p-4' : 'p-6 md:p-8'
      } ${className}`}
    >
      <div
        className={`flex items-center justify-center rounded-2xl bg-destructive/10 text-destructive shrink-0 shadow-xs ${
          compact ? 'h-9 w-9 mb-2.5 rounded-xl' : 'h-12 w-12 mb-4'
        }`}
      >
        <AlertTriangle className={compact ? 'h-5 w-5' : 'h-6 w-6'} aria-hidden="true" />
      </div>

      <h3
        className={`font-bold tracking-tight text-foreground mb-1 break-words ${
          compact ? 'text-sm' : 'text-base'
        }`}
      >
        {title}
      </h3>

      <p
        className={`text-muted-foreground mb-4 leading-relaxed break-words ${
          compact ? 'text-xs max-w-xs' : 'text-xs sm:text-sm max-w-md'
        }`}
      >
        {sanitizedMessage}
      </p>

      {correlationId && (
        <p className="text-[11px] font-mono text-muted-foreground mb-4 select-all">
          ID de referencia: {correlationId}
        </p>
      )}

      {(onRetry || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-2.5 shrink-0">
          {secondaryAction}
          {onRetry && (
            <Button
              type="button"
              size="sm"
              onClick={onRetry}
              className="gap-1.5 font-semibold shadow-xs"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{retryLabel}</span>
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
