import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Badge,
} from '@kinergy-platform/ui';
import { RotateCcw, Loader2, ShieldCheck } from 'lucide-react';
import {
  useRetryDocumentIngestion,
  useRetryVersionIngestion,
} from '../hooks/use-knowledge-mutations';
import type { IngestionJobItem } from '../types/knowledge-contract.types';

export interface DocumentRetryDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onRetried?: () => void;
  readonly document: {
    readonly id: string;
    readonly title: string;
    readonly currentVersionNumber?: number;
  };
  readonly job?: IngestionJobItem | null;
  readonly targetVersionId?: string;
}

export const DocumentRetryDialog: React.FC<DocumentRetryDialogProps> = ({
  isOpen,
  onClose,
  onRetried,
  document,
  job,
  targetVersionId,
}) => {
  const retryDocumentMutation = useRetryDocumentIngestion();
  const retryVersionMutation = useRetryVersionIngestion();

  const isRetrying = retryDocumentMutation.isPending || retryVersionMutation.isPending;

  const currentAttempt = job?.attemptCount ?? 1;
  const maxAttempts = job?.maxAttempts ?? 3;
  const nextAttemptNumber = Math.min(currentAttempt + 1, maxAttempts);

  const handleConfirmRetry = async () => {
    if (isRetrying) return;

    try {
      if (targetVersionId) {
        await retryVersionMutation.mutateAsync({
          documentId: document.id,
          versionId: targetVersionId,
        });
      } else {
        await retryDocumentMutation.mutateAsync(document.id);
      }
      onClose();
      if (onRetried) {
        onRetried();
      }
    } catch {
      // Error handled by mutation toast notification
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isRetrying && onClose()}>
      <DialogContent
        data-testid="document-retry-dialog"
        aria-describedby="retry-dialog-description"
        className="sm:max-w-md"
      >
        <DialogHeader className="gap-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <RotateCcw className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <DialogTitle className="text-base font-bold text-foreground">
              Confirmar Reintento de Ingesta
            </DialogTitle>
            <DialogDescription
              id="retry-dialog-description"
              className="text-xs text-muted-foreground mt-1"
            >
              Esta acción reanudará el procesamiento del documento en segundo plano. El intento
              fallido previo se preservará en el registro histórico.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs space-y-2">
          <div className="flex items-center justify-between border-b border-border/40 pb-2">
            <span className="font-semibold text-foreground truncate">{document.title}</span>
            <Badge variant="outline" className="text-[10px] shrink-0 font-mono">
              v{document.currentVersionNumber ?? 1}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground pt-0.5">
            <div>
              <span className="block text-[10px]">Intento siguiente:</span>
              <span className="font-semibold text-foreground">
                #{nextAttemptNumber} de {maxAttempts}
              </span>
            </div>
            <div>
              <span className="block text-[10px]">Fallo previo:</span>
              <span className="font-mono text-foreground truncate block">
                {job?.lastErrorCode || 'ERROR_TRANSITORIO'}
              </span>
            </div>
          </div>

          {job?.lastErrorMessage && (
            <div className="rounded border border-border/40 bg-card p-2 text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground block text-[10px]">
                Diagnóstico previo:
              </span>
              <p className="line-clamp-2 mt-0.5">{job.lastErrorMessage}</p>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-[10px] text-emerald-700 dark:text-emerald-400 pt-1">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Los vectores e índices existentes se preservan durante el reintento</span>
          </div>
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isRetrying}
            data-testid="cancel-retry-document-button"
            className="text-xs"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={handleConfirmRetry}
            disabled={isRetrying}
            data-testid="confirm-retry-document-button"
            className="text-xs gap-1.5"
          >
            {isRetrying ? (
              <>
                <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />
                <span>Solicitando reintento...</span>
              </>
            ) : (
              <>
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Iniciar Reintento</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
