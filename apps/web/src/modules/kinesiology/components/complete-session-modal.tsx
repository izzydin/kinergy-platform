import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
} from '@kinergy-platform/ui';

export interface CompleteSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  isLoading?: boolean;
  hasNotes?: boolean;
  hasUnsavedNotes?: boolean;
  error?: Error | null;
}

export const CompleteSessionModal: React.FC<CompleteSessionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
  hasNotes = true,
  hasUnsavedNotes = false,
  error = null,
}) => {
  const [acknowledgedEmptyNotes, setAcknowledgedEmptyNotes] = useState(false);
  const [acknowledgedUnsavedNotes, setAcknowledgedUnsavedNotes] = useState(false);

  const handleConfirm = async () => {
    try {
      await onConfirm();
    } catch {
      // Error handled by caller
    }
  };

  const handleClose = () => {
    setAcknowledgedEmptyNotes(false);
    setAcknowledgedUnsavedNotes(false);
    onClose();
  };

  const isConfirmDisabled =
    isLoading ||
    (!hasNotes && !acknowledgedEmptyNotes) ||
    (hasUnsavedNotes && !acknowledgedUnsavedNotes);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground font-bold">
            Sign & Complete Treatment Session
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-2">
            Completing this session signifies that the clinical encounter and SOAP documentation are
            finalized.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 my-2 text-xs">
          {/* Clinical Documentation Status Notice */}
          {hasNotes ? (
            <div
              className="rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-3 text-emerald-800 dark:text-emerald-200"
              data-testid="notes-present-notice"
            >
              <p className="font-semibold">✓ Clinical Notes Documented</p>
              <p className="mt-0.5">
                Structured SOAP findings are recorded and will be permanently sealed upon signing.
              </p>
            </div>
          ) : (
            <div
              className="rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3 text-amber-800 dark:text-amber-200 space-y-2"
              data-testid="empty-notes-warning"
            >
              <div>
                <p className="font-semibold">⚠️ Incomplete Clinical Documentation Notice</p>
                <p className="mt-0.5">
                  No SOAP progress notes have been documented for this session. Completing will lock
                  this clinical record with empty documentation.
                </p>
              </div>
              <label className="flex items-start space-x-2 pt-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  data-testid="confirm-empty-notes-checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-ring"
                  checked={acknowledgedEmptyNotes}
                  onChange={(e) => setAcknowledgedEmptyNotes(e.target.checked)}
                  disabled={isLoading}
                />
                <span className="text-xs text-amber-900 dark:text-amber-100 font-medium">
                  I acknowledge completing this encounter without documented SOAP notes.
                </span>
              </label>
            </div>
          )}

          {/* Unsaved Draft Notes Warning */}
          {hasUnsavedNotes && (
            <div
              className="rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3 text-amber-800 dark:text-amber-200 space-y-2"
              data-testid="unsaved-notes-warning"
            >
              <div>
                <p className="font-semibold">⚠️ Unsaved Note Changes in Editor</p>
                <p className="mt-0.5">
                  You have unsaved changes in the clinical SOAP editor. Signing and completing this
                  session will permanently seal documentation and discard unsaved drafts.
                </p>
              </div>
              <label className="flex items-start space-x-2 pt-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  data-testid="confirm-unsaved-notes-checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-ring"
                  checked={acknowledgedUnsavedNotes}
                  onChange={(e) => setAcknowledgedUnsavedNotes(e.target.checked)}
                  disabled={isLoading}
                />
                <span className="text-xs text-amber-900 dark:text-amber-100 font-medium">
                  I acknowledge that unsaved edits in the editor will be discarded upon signing.
                </span>
              </label>
            </div>
          )}

          <div className="rounded-md bg-muted/50 border border-border p-3 text-muted-foreground space-y-1">
            <p className="font-semibold text-foreground">⚠️ Irreversible Medico-Legal Action:</p>
            <p>
              Once completed, clinical SOAP notes are permanently locked into read-only mode and the
              session cannot be edited, reopened, or cancelled.
            </p>
          </div>

          {error && (
            <div
              className="rounded-md bg-red-50 border border-red-200 p-3 text-red-800"
              role="alert"
              data-testid="complete-error-banner"
            >
              <p className="font-semibold">Completion Failed</p>
              <p className="mt-0.5">
                {error.message || 'An error occurred while completing the session.'}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-end space-x-2 pt-4">
          <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
            data-testid="sign-and-complete-btn"
          >
            {isLoading ? 'Signing & Completing...' : 'Sign & Complete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
