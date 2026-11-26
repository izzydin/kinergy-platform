import React from 'react';
import {
  AlertCircle,
  Ban,
  Clock,
  Cpu,
  Database,
  HelpCircle,
  Loader2,
  RefreshCw,
  RotateCcw,
  Sparkles,
  WifiOff,
} from 'lucide-react';
import { Button } from '@kinergy-platform/ui';
import type { ChatMessage } from '../types/assistant.types';

export interface MessageStatusIndicatorProps {
  status: ChatMessage['status'];
  error?: string;
  errorCode?: string;
  retryable?: boolean;
  retryAfterSeconds?: number;
  correlationId?: string;
  onRetry?: () => void;
  onReconcile?: () => void;
}

export type FailureCategory =
  | 'PROVIDER_UNAVAILABLE'
  | 'RETRIEVAL_UNAVAILABLE'
  | 'GENERATION_FAILED'
  | 'NETWORK_INTERRUPTED'
  | 'UNKNOWN_OUTCOME'
  | 'CLIENT_CANCELLED'
  | 'GENERIC_ERROR';

/**
 * Classifies failure states into distinct, understandable categories (ER.06).
 */
export function classifyMessageFailure(
  status: ChatMessage['status'],
  error?: string,
  errorCode?: string,
): FailureCategory {
  if (status === 'cancelled') return 'CLIENT_CANCELLED';
  if (status === 'unknown') return 'UNKNOWN_OUTCOME';
  if (status === 'interrupted') return 'NETWORK_INTERRUPTED';

  const normalizedCode = (errorCode || '').toUpperCase();
  const lowerMsg = (error || '').toLowerCase();

  // 1. AI Provider Unavailable / Timeout / Rate Limit
  if (
    normalizedCode === 'PROVIDER_UNAVAILABLE' ||
    normalizedCode === 'PROVIDER_RATE_LIMITED' ||
    normalizedCode === 'PROVIDER_TIMEOUT' ||
    normalizedCode === 'AI_PROVIDER_UNAVAILABLE' ||
    normalizedCode === 'MODEL_NOT_FOUND' ||
    normalizedCode === 'RATE_LIMITED' ||
    lowerMsg.includes('pasarela de inferencia') ||
    lowerMsg.includes('gateway timeout') ||
    lowerMsg.includes('504') ||
    lowerMsg.includes('503') ||
    lowerMsg.includes('provider unavailable') ||
    lowerMsg.includes('servicio de inferencia') ||
    lowerMsg.includes('modelo no disponible') ||
    lowerMsg.includes('rate limit')
  ) {
    return 'PROVIDER_UNAVAILABLE';
  }

  // 2. Retrieval Unavailable / Vector Store / Embedding
  if (
    normalizedCode === 'RETRIEVAL_UNAVAILABLE' ||
    normalizedCode === 'VECTOR_STORE_UNAVAILABLE' ||
    normalizedCode === 'EMBEDDING_FAILED' ||
    normalizedCode === 'RETRIEVAL_DATABASE_ERROR' ||
    lowerMsg.includes('base de conocimiento no disponible') ||
    lowerMsg.includes('vector') ||
    lowerMsg.includes('retrieval') ||
    lowerMsg.includes('repositorio de conocimiento') ||
    lowerMsg.includes('embedding')
  ) {
    return 'RETRIEVAL_UNAVAILABLE';
  }

  // 3. Generation Failure / Malformed output / Validation
  if (
    normalizedCode === 'GENERATION_FAILED' ||
    normalizedCode === 'MALFORMED_OUTPUT' ||
    normalizedCode === 'RESPONSE_VALIDATION_FAILED' ||
    lowerMsg.includes('malformed') ||
    lowerMsg.includes('generación falló') ||
    lowerMsg.includes('validation failed')
  ) {
    return 'GENERATION_FAILED';
  }

  return 'GENERIC_ERROR';
}

/**
 * Message Status Indicator (ER.06 Hardened).
 *
 * Implements distinct visual states for:
 * - Submitting / Retrieving / Pending / Generating
 * - Client Cancellation
 * - AI Provider Unavailable / Overloaded / Rate Limited
 * - Knowledge / Vector Retrieval Unavailable
 * - Synthesis & Generation Failure
 * - Network Interruption
 * - Unknown / Unconfirmed Outcome
 */
export const MessageStatusIndicator: React.FC<MessageStatusIndicatorProps> = ({
  status,
  error,
  errorCode,
  retryable,
  retryAfterSeconds,
  correlationId,
  onRetry,
  onReconcile,
}) => {
  if (status === 'submitting') {
    return (
      <div
        data-testid="message-submitting-state"
        role="status"
        aria-live="polite"
        className="flex items-center gap-2.5 text-muted-foreground py-0.5"
      >
        <Loader2 className="h-4 w-4 motion-safe:animate-spin text-primary" />
        <span className="text-xs font-medium motion-safe:animate-pulse">
          Enviando consulta al asistente...
        </span>
      </div>
    );
  }

  if (status === 'retrieving') {
    return (
      <div
        data-testid="message-retrieving-state"
        role="status"
        aria-live="polite"
        className="flex items-center gap-2.5 text-muted-foreground py-0.5"
      >
        <Sparkles className="h-4 w-4 motion-safe:animate-spin text-primary" />
        <span className="text-xs font-medium motion-safe:animate-pulse">
          Consultando base de conocimiento clínica...
        </span>
      </div>
    );
  }

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
    const isTimeout =
      errorCode === 'PROVIDER_TIMEOUT' ||
      (error && error.toLowerCase().includes('gateway timeout')) ||
      (error && error.includes('504'));

    return (
      <div
        data-testid="message-interrupted-state"
        role="alert"
        className="flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-amber-800 dark:text-amber-300"
      >
        <div className="flex items-start gap-2.5">
          {isTimeout ? (
            <Cpu className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" aria-hidden="true" />
          ) : (
            <WifiOff className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" aria-hidden="true" />
          )}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold">
              {isTimeout
                ? 'Tiempo de espera agotado en pasarela de inferencia (504)'
                : 'Conexión interrumpida'}
            </span>
            <p className="text-xs leading-relaxed opacity-90">
              {error ||
                'La conexión se interrumpió antes de recibir la respuesta completa del asistente. Tu consulta fue guardada.'}
            </p>
            {correlationId && (
              <span className="text-[10px] text-muted-foreground font-mono mt-0.5">
                Diagnóstico: {correlationId}
              </span>
            )}
          </div>
        </div>
        {onRetry && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="self-start gap-1.5 text-xs h-7 border-amber-500/40 hover:bg-amber-500/10 text-amber-700 dark:text-amber-300 mt-0.5"
          >
            <RotateCcw className="h-3 w-3" />
            Reintentar
          </Button>
        )}
      </div>
    );
  }

  if (status === 'unknown') {
    return (
      <div
        data-testid="message-unknown-state"
        role="alert"
        className="flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-amber-800 dark:text-amber-300"
      >
        <div className="flex items-start gap-2.5">
          <HelpCircle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold">Resultado no confirmado</span>
            <p className="text-xs leading-relaxed opacity-90">
              {error ||
                'Estado de generación no confirmado. El servidor podría haber completado la respuesta.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-1">
          {onReconcile && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onReconcile}
              className="gap-1.5 text-xs h-7 border-amber-500/40 hover:bg-amber-500/10 text-amber-600 dark:text-amber-400"
            >
              <RefreshCw className="h-3 w-3" />
              Verificar con servidor
            </Button>
          )}
          {onRetry && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="gap-1.5 text-xs h-7 border-border/70 hover:bg-muted"
            >
              <RotateCcw className="h-3 w-3" />
              Reintentar
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (status === 'error') {
    const failureCategory = classifyMessageFailure(status, error, errorCode);
    const normalizedCode = (errorCode || '').toUpperCase();
    const lowerMsg = (error || '').toLowerCase();

    const isRateLimited =
      normalizedCode === 'RATE_LIMITED' ||
      normalizedCode === 'PROVIDER_RATE_LIMITED' ||
      lowerMsg.includes('rate limit') ||
      lowerMsg.includes('límite');

    const isTimeout =
      normalizedCode === 'PROVIDER_TIMEOUT' ||
      lowerMsg.includes('gateway timeout') ||
      lowerMsg.includes('tiempo de espera');

    // A1. Provider Rate Limited
    if (isRateLimited) {
      return (
        <div
          data-testid="message-error-state"
          data-failure-category="PROVIDER_UNAVAILABLE"
          role="alert"
          className="flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-amber-800 dark:text-amber-300"
        >
          <div data-testid="message-rate-limited-state" className="flex items-start gap-2.5">
            <Clock className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" aria-hidden="true" />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold">Límite de capacidad temporal alcanzado</span>
              <p className="text-xs leading-relaxed opacity-90">
                Se ha alcanzado temporalmente el límite de solicitudes de inferencia. Por favor
                espere
                {retryAfterSeconds ? ` ${retryAfterSeconds} segundos` : ''} antes de intentar
                nuevamente. Tu consulta fue guardada.
              </p>
              {correlationId && (
                <span
                  data-testid="failure-diagnostic-id"
                  className="text-[10px] text-muted-foreground font-mono mt-0.5"
                >
                  Diagnóstico: {correlationId}
                </span>
              )}
            </div>
          </div>
          {onRetry && retryable !== false && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onRetry?.()}
              data-testid="message-retry-btn"
              className="self-start gap-1.5 text-xs h-7 border-amber-500/40 hover:bg-amber-500/10 text-amber-700 dark:text-amber-300 mt-1"
            >
              <RotateCcw className="h-3 w-3" />
              Reintentar generación
            </Button>
          )}
        </div>
      );
    }

    // A2. Provider Timeout
    if (isTimeout) {
      return (
        <div
          data-testid="message-error-state"
          data-failure-category="PROVIDER_UNAVAILABLE"
          role="alert"
          className="flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-amber-800 dark:text-amber-300"
        >
          <div data-testid="message-provider-timeout-state" className="flex items-start gap-2.5">
            <Cpu className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" aria-hidden="true" />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold">
                Tiempo de espera del modelo de IA agotado
              </span>
              <p className="text-xs leading-relaxed opacity-90">
                El modelo de IA tardó demasiado en responder y la solicitud excedió el tiempo límite
                permitido. Tu consulta fue guardada de forma segura.
              </p>
              {correlationId && (
                <span
                  data-testid="failure-diagnostic-id"
                  className="text-[10px] text-muted-foreground font-mono mt-0.5"
                >
                  Diagnóstico: {correlationId}
                </span>
              )}
            </div>
          </div>
          {onRetry && retryable !== false && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onRetry?.()}
              data-testid="message-retry-btn"
              className="self-start gap-1.5 text-xs h-7 border-amber-500/40 hover:bg-amber-500/10 text-amber-700 dark:text-amber-300 mt-1"
            >
              <RotateCcw className="h-3 w-3" />
              Reintentar generación
            </Button>
          )}
        </div>
      );
    }

    // A3. AI Provider Unavailable / Outage / General Failure
    if (failureCategory === 'PROVIDER_UNAVAILABLE') {
      return (
        <div
          data-testid="message-error-state"
          data-failure-category="PROVIDER_UNAVAILABLE"
          role="alert"
          className="flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-amber-800 dark:text-amber-300"
        >
          <div
            data-testid="message-provider-unavailable-state"
            className="flex items-start gap-2.5"
          >
            <Cpu className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" aria-hidden="true" />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold">
                Servicio de IA temporalmente no disponible
              </span>
              <p className="text-xs leading-relaxed opacity-90">
                El asistente no pudo completar la generación porque el servicio de inferencia de IA
                se encuentra saturado o fuera de servicio temporalmente. Tu consulta fue guardada de
                forma segura.
              </p>
              {retryAfterSeconds && (
                <div className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 font-medium mt-0.5">
                  <Clock className="h-3 w-3" />
                  <span>Tiempo estimado de espera: {retryAfterSeconds} segundos</span>
                </div>
              )}
              {correlationId && (
                <span
                  data-testid="failure-diagnostic-id"
                  className="text-[10px] text-muted-foreground font-mono mt-0.5"
                >
                  Diagnóstico: {correlationId}
                </span>
              )}
            </div>
          </div>
          {onRetry && retryable !== false && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onRetry?.()}
              data-testid="message-retry-btn"
              className="self-start gap-1.5 text-xs h-7 border-amber-500/40 hover:bg-amber-500/10 text-amber-700 dark:text-amber-300 mt-1"
            >
              <RotateCcw className="h-3 w-3" />
              Reintentar generación
            </Button>
          )}
        </div>
      );
    }

    // B. Retrieval Unavailable / Vector Database / Embedding Outage
    if (failureCategory === 'RETRIEVAL_UNAVAILABLE') {
      return (
        <div
          data-testid="message-error-state"
          data-failure-category="RETRIEVAL_UNAVAILABLE"
          role="alert"
          className="flex flex-col gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3 text-indigo-900 dark:text-indigo-200"
        >
          <div
            data-testid="message-retrieval-unavailable-state"
            className="flex items-start gap-2.5"
          >
            <Database className="h-4 w-4 shrink-0 text-indigo-500 mt-0.5" aria-hidden="true" />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold">Base de conocimiento no disponible</span>
              <p className="text-xs leading-relaxed opacity-90">
                No fue posible consultar la base de documentos clínicos o calcular embeddings debido
                a una interrupción temporal del motor de búsqueda. Esto no significa que no existan
                guías sobre tu consulta. Tu pregunta fue guardada.
              </p>
              {correlationId && (
                <span
                  data-testid="failure-diagnostic-id"
                  className="text-[10px] text-muted-foreground font-mono mt-0.5"
                >
                  Diagnóstico: {correlationId}
                </span>
              )}
            </div>
          </div>
          {onRetry && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onRetry?.()}
              data-testid="message-retry-btn"
              className="self-start gap-1.5 text-xs h-7 border-indigo-500/40 hover:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 mt-1"
            >
              <RotateCcw className="h-3 w-3" />
              Reintentar búsqueda
            </Button>
          )}
        </div>
      );
    }

    // D. Generation Failure / Malformed output
    if (failureCategory === 'GENERATION_FAILED') {
      return (
        <div
          data-testid="message-error-state"
          data-failure-category="GENERATION_FAILED"
          role="alert"
          className="flex flex-col gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-destructive"
        >
          <div data-testid="message-generation-failed-state" className="flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold">Error al generar la respuesta</span>
              <p className="text-xs leading-relaxed opacity-90">
                Ocurrió un error al procesar y sintetizar la respuesta médica. La consulta del
                usuario permanece guardada de forma segura.
              </p>
              {correlationId && (
                <span
                  data-testid="failure-diagnostic-id"
                  className="text-[10px] text-muted-foreground font-mono mt-0.5"
                >
                  Diagnóstico: {correlationId}
                </span>
              )}
            </div>
          </div>
          {onRetry && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onRetry?.()}
              data-testid="message-retry-btn"
              className="self-start gap-1.5 text-xs h-7 border-destructive/30 hover:bg-destructive/10 mt-1"
            >
              <RotateCcw className="h-3 w-3" />
              Reintentar respuesta
            </Button>
          )}
        </div>
      );
    }

    // Generic error fallback
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
            data-testid="message-retry-btn"
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
