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
import { RotateCcw, Loader2, CheckCircle2 } from 'lucide-react';
import { useRestoreKnowledgeDocument } from '../hooks/use-knowledge-mutations';

export interface DocumentRestoreDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onRestored?: () => void;
  readonly document: {
    readonly id: string;
    readonly title: string;
    readonly versionNumber?: number;
    readonly versionCount?: number;
  };
}

export const DocumentRestoreDialog: React.FC<DocumentRestoreDialogProps> = ({
  isOpen,
  onClose,
  onRestored,
  document,
}) => {
  const restoreMutation = useRestoreKnowledgeDocument();

  const handleConfirmRestore = async () => {
    if (restoreMutation.isPending) return;

    try {
      await restoreMutation.mutateAsync(document.id);
      onClose();
      if (onRestored) {
        onRestored();
      }
    } catch {
      // Error handled by mutation onError notification
    }
  };

  const isRestoring = restoreMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isRestoring && onClose()}>
      <DialogContent
        data-testid="document-restore-dialog"
        aria-describedby="restore-dialog-description"
        className="sm:max-w-md"
      >
        <DialogHeader className="gap-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <RotateCcw className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <DialogTitle className="text-base font-bold text-foreground">
              ¿Restaurar documento en la base de conocimiento?
            </DialogTitle>
            <DialogDescription
              id="restore-dialog-description"
              className="text-xs text-muted-foreground mt-1"
            >
              Esta acción reactivará el documento y encolará automáticamente la reindexación
              vectorial en el motor RAG para que vuelva a estar disponible en las respuestas del
              asistente.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs space-y-1.5">
          <p className="font-semibold text-foreground truncate">{document.title}</p>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-mono">v{document.versionNumber ?? 1}</span>
            <span>•</span>
            <span>{document.versionCount ?? 1} versión(es) registradas</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 pt-1">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>El documento volverá a tener estado ACTIVO</span>
          </div>
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isRestoring}
            data-testid="cancel-restore-document-button"
            className="text-xs"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={handleConfirmRestore}
            disabled={isRestoring}
            data-testid="confirm-restore-document-button"
            className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isRestoring ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                <span>Restaurando...</span>
              </>
            ) : (
              <>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Restaurar documento</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
