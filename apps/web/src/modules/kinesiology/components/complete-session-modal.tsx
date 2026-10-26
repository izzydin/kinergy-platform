import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
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
  error?: Error | null;
}

export const CompleteSessionModal: React.FC<CompleteSessionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
  hasNotes = true,
  error = null,
}) => {
  const [acknowledgedEmptyNotes, setAcknowledgedEmptyNotes] = useState(false);

  const handleConfirm = async () => {
    await onConfirm();
  };

  const handleClose = () => {
    setAcknowledgedEmptyNotes(false);
    onClose();
  };

  const isConfirmDisabled = isLoading || (!hasNotes && !acknowledgedEmptyNotes);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-slate-900">Sign & Complete Treatment Session</DialogTitle>
          <p className="text-sm text-slate-500 mt-2">
            Completing this session signifies that the clinical encounter and SOAP documentation are
            finalized.
          </p>
        </DialogHeader>

        <div className="space-y-3 my-2 text-xs">
          {/* Clinical Documentation Status Notice */}
          {hasNotes ? (
            <div
              className="rounded-md bg-emerald-50 border border-emerald-200 p-3 text-emerald-800"
              data-testid="notes-present-notice"
            >
              <p className="font-semibold">✓ Clinical Notes Documented</p>
              <p className="mt-0.5">
                Structured SOAP findings are recorded and will be permanently sealed upon signing.
              </p>
            </div>
          ) : (
            <div
              className="rounded-md bg-amber-50 border border-amber-200 p-3 text-amber-800 space-y-2"
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
                  className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                  checked={acknowledgedEmptyNotes}
                  onChange={(e) => setAcknowledgedEmptyNotes(e.target.checked)}
                  disabled={isLoading}
                />
                <span className="text-xs text-amber-900 font-medium">
                  I acknowledge completing this encounter without documented SOAP notes.
                </span>
              </label>
            </div>
          )}

          <div className="rounded-md bg-slate-50 border border-slate-200 p-3 text-slate-700 space-y-1">
            <p className="font-semibold text-slate-900">⚠️ Irreversible Medico-Legal Action:</p>
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
          >
            {isLoading ? 'Signing & Completing...' : 'Sign & Complete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
