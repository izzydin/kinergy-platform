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
import { AlertTriangle, Trash2, Loader2, ShieldAlert } from 'lucide-react';
import { useDeleteKnowledgeDocument } from '../hooks/use-knowledge-mutations';
import type { KnowledgeDocumentItem } from '../types/knowledge-contract.types';

export interface DocumentDeleteDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onDeleted?: () => void;
  readonly document: KnowledgeDocumentItem;
}

export const DocumentDeleteDialog: React.FC<DocumentDeleteDialogProps> = ({
  isOpen,
  onClose,
  onDeleted,
  document,
}) => {
  const deleteMutation = useDeleteKnowledgeDocument();

  const handleConfirmDelete = async () => {
    if (deleteMutation.isPending) return;

    try {
      await deleteMutation.mutateAsync(document.id);
      onClose();
      if (onDeleted) {
        onDeleted();
      }
    } catch {
      // Error handled by mutation onError notification
    }
  };

  const isDeleting = deleteMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isDeleting && onClose()}>
      <DialogContent
        data-testid="document-delete-dialog"
        aria-describedby="delete-dialog-description"
        className="sm:max-w-md"
      >
        <DialogHeader className="gap-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <DialogTitle className="text-base font-bold text-foreground">
              ¿Eliminar documento de la base de conocimiento?
            </DialogTitle>
            <DialogDescription
              id="delete-dialog-description"
              className="text-xs text-muted-foreground mt-1"
            >
              Esta acción ejecutará una eliminación lógica (soft delete). Los vectores semánticos
              asociados serán purgados inmediatamente y el documento dejará de ser consultable por
              el asistente de IA. Los archivos y versiones históricas se conservan bajo la política
              de retención.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs space-y-1">
          <p className="font-semibold text-foreground truncate">{document.title}</p>
          <p className="text-muted-foreground truncate">{document.originalFileName}</p>
          <p className="text-[11px] text-muted-foreground">
            {document.versionCount || 1} versión(es) asociada(s)
          </p>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-1 border-t border-border/40">
            <ShieldAlert className="h-3.5 w-3.5 text-amber-500 shrink-0" aria-hidden="true" />
            <span>Eliminación lógica con retención de cumplimiento legal y citas previas.</span>
          </div>
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isDeleting}
            data-testid="cancel-delete-document-button"
            className="text-xs"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirmDelete}
            disabled={isDeleting}
            data-testid="confirm-delete-document-button"
            className="text-xs gap-1.5"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                <span>Eliminando...</span>
              </>
            ) : (
              <>
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Eliminar documento</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
