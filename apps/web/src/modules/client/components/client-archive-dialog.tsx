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
import { Archive, AlertTriangle } from 'lucide-react';
import { useArchiveClientMutation } from '../hooks/use-client-mutations';
import type { ClientModel } from '../types/client.types';

export interface ClientArchiveDialogProps {
  readonly client: ClientModel | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export const ClientArchiveDialog: React.FC<ClientArchiveDialogProps> = ({
  client,
  open,
  onOpenChange,
}) => {
  const archiveMutation = useArchiveClientMutation();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!client) return null;

  const handleConfirm = async () => {
    setErrorMessage(null);
    try {
      await archiveMutation.mutateAsync({
        id: client.id,
        expectedVersion: client.version,
      });
      onOpenChange(false);
    } catch (err: unknown) {
      const status =
        (err as { status?: number })?.status ?? (err as { statusCode?: number })?.statusCode;
      const message =
        (err as { message?: string })?.message ??
        'An error occurred while archiving the client record.';

      if (
        status === 412 ||
        message.toLowerCase().includes('version') ||
        message.toLowerCase().includes('concurrency')
      ) {
        setErrorMessage(
          'Concurrency Conflict: The client record was updated by another process. Please close and refresh to verify the latest state before archiving.',
        );
      } else if (status === 409 || message.toLowerCase().includes('already archived')) {
        setErrorMessage('Conflict: This client profile is already in archived status.');
      } else {
        setErrorMessage(message);
      }
    }
  };

  const isPending = archiveMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !isPending && onOpenChange(nextOpen)}>
      <DialogContent className="sm:max-w-md" data-testid="client-archive-dialog">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-full bg-amber-100 text-amber-700">
              <Archive className="h-5 w-5" aria-hidden="true" />
            </div>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Archive Client Profile
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm text-slate-600 pt-2">
            Are you sure you want to archive{' '}
            <strong className="text-slate-900">
              {client.fullName || `${client.firstName} ${client.lastName}`}
            </strong>{' '}
            (<span className="font-mono text-xs">{client.referenceNumber}</span>)?
          </DialogDescription>
        </DialogHeader>

        {/* Consequential Action Information */}
        <div className="space-y-3 py-2 text-xs text-slate-600">
          <p>Archiving a client marks their profile as inactive:</p>
          <ul className="list-disc pl-5 space-y-1 text-slate-700">
            <li>New appointment scheduling and check-in bookings will be restricted.</li>
            <li>Active recurring facility access agreements will require review.</li>
            <li>
              All historical treatment sessions, clinical SOAP notes, and commercial sales records
              remain preserved.
            </li>
          </ul>
        </div>

        {errorMessage && (
          <Alert variant="destructive" className="py-2" role="alert">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <AlertTitle className="text-xs font-semibold">Unable to Archive</AlertTitle>
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
            variant="destructive"
            size="sm"
            onClick={handleConfirm}
            disabled={isPending}
            className="gap-1.5"
            data-testid="confirm-archive-button"
          >
            {isPending ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Archiving Client...</span>
              </>
            ) : (
              <>
                <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Confirm Archive</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
