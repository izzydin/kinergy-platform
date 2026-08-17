import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
} from '@kinergy-platform/ui';

interface CompleteSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  isLoading?: boolean;
}

export const CompleteSessionModal: React.FC<CompleteSessionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
}) => {
  const handleConfirm = async () => {
    await onConfirm();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-slate-900">Sign & Complete Treatment Session</DialogTitle>
          <p className="text-sm text-slate-500 mt-2">
            Completing this session signifies that the clinical encounter and SOAP documentation are
            finalized.
          </p>
        </DialogHeader>

        <div className="rounded-md bg-amber-50 border border-amber-200 p-3 my-2 text-xs text-amber-800 space-y-1">
          <p className="font-semibold">⚠️ Irreversible Medico-Legal Action:</p>
          <p>
            Once completed, clinical SOAP notes are permanently locked into read-only mode and the
            session cannot be edited or reopened.
          </p>
        </div>

        <DialogFooter className="flex justify-end space-x-2 pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="button" variant="default" onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? 'Signing & Completing...' : 'Sign & Complete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
