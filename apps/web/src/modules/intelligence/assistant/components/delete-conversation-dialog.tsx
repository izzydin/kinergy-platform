import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Alert,
  AlertDescription,
} from '@kinergy-platform/ui';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';

export interface DeleteConversationDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly conversationTitle?: string;
  readonly onConfirm: () => Promise<void> | void;
  readonly isDeleting?: boolean;
}

/**
 * Delete Conversation Confirmation Dialog Component.
 *
 * Implements accessible, non-accidental conversation archival:
 * - Clear warning about soft-delete semantics and regulatory compliance retention
 * - Focus management, escape key dismissal, and backdrop shroud
 * - Cancel and Confirm actions with pending loader states
 * - Error alert feedback with conflict resolution messaging
 */
export const DeleteConversationDialog: React.FC<DeleteConversationDialogProps> = ({
  open,
  onOpenChange,
  conversationTitle,
  onConfirm,
  isDeleting = false,
}) => {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setErrorMessage(null);
    }
  }, [open]);

  const handleConfirm = async () => {
    setErrorMessage(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (err: unknown) {
      const status =
        (err as { status?: number })?.status ?? (err as { statusCode?: number })?.statusCode;
      const message =
        (err as { message?: string })?.message ?? 'Error al eliminar la conversación.';

      if (status === 409 || message.toLowerCase().includes('in progress')) {
        setErrorMessage(
          'Conflicto: No se puede archivar la conversación mientras hay una respuesta en generación.',
        );
      } else if (message.toLowerCase().includes('already archived')) {
        setErrorMessage('La conversación ya fue archivada previamente.');
      } else {
        setErrorMessage(message);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !isDeleting && onOpenChange(nextOpen)}>
      <DialogContent className="sm:max-w-md" data-testid="delete-conversation-dialog">
        <DialogHeader>
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <DialogTitle>¿Eliminar conversación?</DialogTitle>
          </div>
          <DialogDescription className="pt-2 text-xs text-muted-foreground leading-relaxed">
            Esta acción archivará la conversación{' '}
            {conversationTitle ? (
              <strong className="text-foreground font-semibold">"{conversationTitle}"</strong>
            ) : (
              'seleccionada'
            )}{' '}
            y la removerá de tu historial activo. De acuerdo con las normativas de retención
            clínica, los registros y auditorías se preservarán de forma segura.
          </DialogDescription>
        </DialogHeader>

        {errorMessage && (
          <Alert
            variant="destructive"
            className="py-2 text-xs"
            data-testid="delete-conversation-error"
          >
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
            data-testid="cancel-delete-button"
            className="text-xs cursor-pointer"
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleConfirm}
            disabled={isDeleting}
            data-testid="confirm-delete-button"
            className="text-xs gap-1.5 cursor-pointer"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Eliminando...</span>
              </>
            ) : (
              <>
                <Trash2 className="h-3.5 w-3.5" />
                <span>Eliminar</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
