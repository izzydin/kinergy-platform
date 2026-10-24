import React, { useState } from 'react';
import { Alert, AlertDescription, AlertTitle, Button } from '@kinergy-platform/ui';
import { AlertTriangle, PowerOff, X } from 'lucide-react';
import type { RoomModel } from '../../types/scheduling.types';
import { useDeactivateRoomMutation } from '../../hooks/use-scheduling-mutations';
import { formatSchedulingErrorMessage } from '../../api/scheduling-error';
import { deactivateRoomSchema } from '../../schemas/room-management.schema';

export interface DeactivateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: RoomModel | null;
  onSuccess?: (updated: RoomModel) => void;
}

export const DeactivateRoomModal: React.FC<DeactivateRoomModalProps> = ({
  isOpen,
  onClose,
  room,
  onSuccess,
}) => {
  const deactivateMutation = useDeactivateRoomMutation();
  const [reason, setReason] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  if (!isOpen || !room) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setClientError(null);
    setServerError(null);

    const validationResult = deactivateRoomSchema.safeParse({
      reason,
      expectedVersion: room.version,
    });

    if (!validationResult.success) {
      setClientError(validationResult.error.issues[0]?.message || 'A valid reason is required.');
      return;
    }

    deactivateMutation.mutate(
      {
        id: room.id,
        payload: {
          reason: reason.trim(),
          expectedVersion: room.version,
        },
      },
      {
        onSuccess: (updated) => {
          onSuccess?.(updated);
          onClose();
        },
        onError: (err) => {
          setServerError(formatSchedulingErrorMessage(err));
        },
      },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deactivate-room-title"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95">
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-amber-500/10">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-md bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <PowerOff className="h-4 w-4" />
              </div>
              <div>
                <h3 id="deactivate-room-title" className="text-sm font-semibold text-foreground">
                  Deactivate Room: {room.name}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Take room offline to prevent new appointment reservations.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={deactivateMutation.isPending}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-3.5">
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
              <div>
                <p className="font-semibold">Authoritative Status Behavior</p>
                <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">
                  Deactivating this room transitions its status to <strong>UNAVAILABLE</strong>.
                  Staff will not be able to book new appointments in this room until reactivated.
                  Existing confirmed appointments remain intact.
                </p>
              </div>
            </div>

            {serverError && (
              <Alert variant="destructive">
                <AlertTitle>Deactivation Failed</AlertTitle>
                <AlertDescription className="text-xs mt-1">{serverError}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <label htmlFor="deactivate-reason" className="text-xs font-semibold text-foreground">
                Deactivation Reason <span className="text-destructive">*</span>
              </label>
              <textarea
                id="deactivate-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Facility renovation, structural repair, temporary closure..."
                className={`w-full text-xs rounded-md border ${
                  clientError ? 'border-destructive' : 'border-input'
                } bg-background px-3 py-2 shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring`}
                disabled={deactivateMutation.isPending}
                required
              />
              {clientError && <p className="text-[11px] text-destructive">{clientError}</p>}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2.5 border-t border-border px-5 py-3.5 bg-muted/20">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={deactivateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              disabled={deactivateMutation.isPending || !reason.trim()}
              className="gap-1.5"
            >
              {deactivateMutation.isPending ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-destructive-foreground border-t-transparent" />
                  <span>Deactivating...</span>
                </>
              ) : (
                <span>Deactivate Room</span>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
