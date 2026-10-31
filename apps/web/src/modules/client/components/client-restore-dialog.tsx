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
  AlertTitle,
  AlertDescription,
} from '@kinergy-platform/ui';
import { ArchiveRestore, AlertTriangle } from 'lucide-react';
import { useRestoreClientMutation } from '../hooks/use-client-mutations';
import type { ClientModel } from '../types/client.types';

export interface ClientRestoreDialogProps {
  readonly client: ClientModel | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export const ClientRestoreDialog: React.FC<ClientRestoreDialogProps> = ({
  client,
  open,
  onOpenChange,
}) => {
  const restoreMutation = useRestoreClientMutation();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!client) return null;

  const handleConfirm = async () => {
    setErrorMessage(null);
    try {
      await restoreMutation.mutateAsync({
        id: client.id,
        expectedVersion: client.version,
      });
      onOpenChange(false);
    } catch (err: unknown) {
      const status =
        (err as { status?: number })?.status ?? (err as { statusCode?: number })?.statusCode;
      const message =
        (err as { message?: string })?.message ??
        'An error occurred while restoring the client record.';

      if (
        status === 412 ||
        message.toLowerCase().includes('version') ||
        message.toLowerCase().includes('concurrency')
      ) {
        setErrorMessage(
          'Concurrency Conflict: The client record was updated by another process. Please close and refresh to verify the latest state before restoring.',
        );
      } else if (status === 409 || message.toLowerCase().includes('already active')) {
        setErrorMessage('Conflict: This client profile is already active.');
      } else {
        setErrorMessage(message);
      }
    }
  };

  const isPending = restoreMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !isPending && onOpenChange(nextOpen)}>
      <DialogContent className="sm:max-w-md" data-testid="client-restore-dialog">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <ArchiveRestore className="h-5 w-5" aria-hidden="true" />
            </div>
            <DialogTitle className="text-lg font-bold text-foreground">
              Restore Client Profile
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm text-muted-foreground pt-2">
            Restore{' '}
            <strong className="text-foreground">
              {client.fullName || `${client.firstName} ${client.lastName}`}
            </strong>{' '}
            (<span className="font-mono text-xs">{client.referenceNumber}</span>) back to Active
            status?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2 text-xs text-muted-foreground">
          <p>Reactivating this client restores standard operational privileges:</p>
          <ul className="list-disc pl-5 space-y-1 text-foreground">
            <li>New appointments and treatment sessions may be scheduled.</li>
            <li>Gym access and membership purchases can be authorized.</li>
            <li>The profile will appear under active directory filter views.</li>
          </ul>
        </div>

        {errorMessage && (
          <Alert variant="destructive" className="py-2" role="alert">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <AlertTitle className="text-xs font-semibold">Unable to Restore</AlertTitle>
            <AlertDescription className="text-xs mt-0.5">{errorMessage}</AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-slate-100">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleConfirm}
            disabled={isPending}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            data-testid="confirm-restore-button"
          >
            {isPending ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Restoring Client...</span>
              </>
            ) : (
              <>
                <ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Confirm Restore</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
