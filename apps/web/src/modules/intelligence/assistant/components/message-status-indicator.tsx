import React from 'react';
import { AlertCircle, Ban, RotateCcw, Sparkles, WifiOff } from 'lucide-react';
import { Button } from '@kinergy-platform/ui';
import type { ChatMessage } from '../types/assistant.types';

export interface MessageStatusIndicatorProps {
  status: ChatMessage['status'];
  error?: string;
  onRetry?: () => void;
}

/**
 * Message Status Indicator.
 *
 * Visual states:
 * - pending: Animated sparkles and accessible progress text
 * - error: Alert icon with error details and retry trigger
 * - cancelled: Client-side cancellation notice with retry trigger
 * - interrupted: Network/connection disruption notice with retry trigger
 * - success: Render nothing
 */
export const MessageStatusIndicator: React.FC<MessageStatusIndicatorProps> = ({
  status,
  error,
  onRetry,
}) => {
  if (status === 'pending') {
    return (
      <div
        data-testid="message-pending-state"
        role="status"
        aria-live="polite"
        className="flex items-center gap-2.5 text-muted-foreground py-0.5"
      >
        <Sparkles className="h-4 w-4 motion-safe:animate-spin text-primary" />
        <span className="text-xs font-medium motion-safe:animate-pulse">
          Sintetizando respuesta fundamentada...
        </span>
      </div>
    );
  }

  if (status === 'generating') {
    return (
      <div
        data-testid="message-generating-state"
        role="status"
        aria-live="polite"
        className="flex items-center gap-2.5 text-muted-foreground py-0.5"
      >
        <Sparkles className="h-4 w-4 motion-safe:animate-spin text-primary" />
        <span className="text-xs font-medium motion-safe:animate-pulse">
          Generando respuesta...
        </span>
      </div>
    );
  }

  if (status === 'cancelling') {
    return (
      <div
        data-testid="message-cancelling-state"
        role="status"
        aria-live="polite"
        className="flex items-center gap-2.5 text-amber-600 dark:text-amber-400 py-0.5"
      >
        <Ban className="h-4 w-4 motion-safe:animate-spin text-amber-500" />
        <span className="text-xs font-medium motion-safe:animate-pulse">
          Deteniendo generación...
        </span>
      </div>
    );
  }

  if (status === 'cancelled') {
    return (
      <div
        data-testid="message-cancelled-state"
        role="status"
        aria-live="polite"
        className="flex flex-col gap-2 text-muted-foreground"
      >
        <div className="flex items-center gap-2 text-xs font-medium">
          <Ban className="h-4 w-4 shrink-0 text-amber-500" />
          <span>{error || 'Generación detenida en el cliente (conexión cerrada).'}</span>
        </div>
        {onRetry && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="self-start gap-1.5 text-xs h-7 border-border/70 hover:bg-muted"
          >
            <RotateCcw className="h-3 w-3" />
            Reintentar
          </Button>
        )}
      </div>
    );
  }

  if (status === 'interrupted') {
    return (
      <div
        data-testid="message-interrupted-state"
        role="alert"
        className="flex flex-col gap-2 text-amber-600 dark:text-amber-400"
      >
        <div className="flex items-center gap-2 text-xs font-medium">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>{error || 'Conexión interrumpida antes de recibir respuesta completa.'}</span>
        </div>
        {onRetry && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="self-start gap-1.5 text-xs h-7 border-amber-500/30 hover:bg-amber-500/10 text-amber-600 dark:text-amber-400"
          >
            <RotateCcw className="h-3 w-3" />
            Reintentar
          </Button>
        )}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div
        data-testid="message-error-state"
        role="alert"
        className="flex flex-col gap-2 text-destructive"
      >
        <div className="flex items-center gap-2 text-xs font-medium">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Error al generar respuesta: {error || 'Fallo de red'}</span>
        </div>
        {onRetry && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="self-start gap-1.5 text-xs h-7 border-destructive/30 hover:bg-destructive/10"
          >
            <RotateCcw className="h-3 w-3" />
            Reintentar
          </Button>
        )}
      </div>
    );
  }

  return null;
};
