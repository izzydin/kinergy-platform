import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
} from '@kinergy-platform/ui';
import { RefreshCw, Loader2, Sparkles } from 'lucide-react';
import { useReprocessKnowledgeDocument } from '../hooks/use-knowledge-mutations';

export interface DocumentReprocessDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onReprocessed?: () => void;
  readonly document: {
    readonly id: string;
    readonly title: string;
    readonly versionNumber?: number;
  };
}

export const DocumentReprocessDialog: React.FC<DocumentReprocessDialogProps> = ({
  isOpen,
  onClose,
  onReprocessed,
  document,
}) => {
  const reprocessMutation = useReprocessKnowledgeDocument();

  const handleConfirmReprocess = async () => {
    if (reprocessMutation.isPending) return;

    try {
      await reprocessMutation.mutateAsync(document.id);
      onClose();
      if (onReprocessed) {
        onReprocessed();
      }
    } catch {
      // Error handled by mutation onError notification
    }
  };

  const isReprocessing = reprocessMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isReprocessing && onClose()}>
      <DialogContent
        data-testid="document-reprocess-dialog"
        aria-describedby="reprocess-dialog-description"
        className="sm:max-w-md"
      >
        <DialogHeader className="gap-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <RefreshCw className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <DialogTitle className="text-base font-bold text-foreground">
              ¿Reprocesar y reindexar documento?
            </DialogTitle>
            <DialogDescription
              id="reprocess-dialog-description"
              className="text-xs text-muted-foreground mt-1"
            >
              Esta acción purgará los vectores anteriores y ejecutará nuevamente la extracción de
              texto, fragmentación en chunks y generación de embeddings para la versión activa.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs space-y-1.5">
          <p className="font-semibold text-foreground truncate">{document.title}</p>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-mono">Versión activa: v{document.versionNumber ?? 1}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-primary pt-1">
            <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Los embeddings se actualizarán con el modelo vectorial vigente</span>
          </div>
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isReprocessing}
            data-testid="cancel-reprocess-document-button"
            className="text-xs"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={handleConfirmReprocess}
            disabled={isReprocessing}
            data-testid="confirm-reprocess-document-button"
            className="text-xs gap-1.5"
          >
            {isReprocessing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                <span>Iniciando...</span>
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Reindexar documento</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
