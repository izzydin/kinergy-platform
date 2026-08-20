import * as React from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@kinergy-platform/ui';

export interface ConfirmDiscardDialogProps {
  /** Whether the confirmation dialog is open. Controlled by the dirty guard. */
  open: boolean;
  /**
   * Called when the user confirms discarding changes.
   * The consumer should call `blocker.proceed()` or close the containing dialog.
   */
  onConfirm: () => void;
  /**
   * Called when the user cancels the discard confirmation (keeps the form open).
   * The consumer should call `blocker.reset()` or do nothing.
   */
  onCancel: () => void;
  /**
   * Optional custom dialog heading.
   * @default "Discard unsaved changes?"
   */
  title?: string;
  /**
   * Optional custom dialog description.
   * @default "You have unsaved changes that will be lost if you leave this page. Are you sure you want to discard them?"
   */
  description?: string;
  /**
   * Label for the destructive discard action button.
   * @default "Discard changes"
   */
  confirmLabel?: string;
  /**
   * Label for the cancel action button.
   * @default "Keep editing"
   */
  cancelLabel?: string;
}

/**
 * ConfirmDiscardDialog
 *
 * Accessible confirmation dialog presented when a user attempts to navigate away from
 * or close a form that has unsaved changes.
 *
 * Used by both `useDirtyGuard` (route-level blocking) and `useDirtyDialogGuard`
 * (dialog close interception).
 *
 * Accessibility:
 * - Focus is trapped inside the dialog when open.
 * - Escape key fires `onCancel` (keeps editing) — consistent with "safe by default".
 * - `aria-modal="true"`, `aria-labelledby`, `aria-describedby` automatically managed
 *   by the Radix Dialog primitive.
 *
 * @example
 * ```tsx
 * const { isBlocked, proceed, reset } = useDirtyGuard({ isDirty, isSubmitSuccessful });
 *
 * <ConfirmDiscardDialog
 *   open={isBlocked}
 *   onConfirm={proceed}
 *   onCancel={reset}
 * />
 * ```
 */
export const ConfirmDiscardDialog: React.FC<ConfirmDiscardDialogProps> = ({
  open,
  onConfirm,
  onCancel,
  title = 'Discard unsaved changes?',
  description = 'You have unsaved changes that will be lost if you leave this page. Are you sure you want to discard them?',
  confirmLabel = 'Discard changes',
  cancelLabel = 'Keep editing',
}) => {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        // Escape key / outside click → cancel (keep editing)
        if (!nextOpen) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md" hideCloseButton>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

ConfirmDiscardDialog.displayName = 'ConfirmDiscardDialog';
