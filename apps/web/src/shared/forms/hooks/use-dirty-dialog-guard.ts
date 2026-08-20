import { useCallback, useState } from 'react';

export interface DirtyDialogGuardOptions {
  /**
   * Whether the form currently has unsaved changes.
   * Should come directly from `formState.isDirty` (React Hook Form).
   */
  isDirty: boolean;
  /**
   * Whether the form has been submitted successfully.
   * Should come directly from `formState.isSubmitSuccessful`.
   * When true, the guard is bypassed and the dialog closes immediately.
   */
  isSubmitSuccessful: boolean;
  /**
   * The actual close / open-change handler.
   * Called when the guard is satisfied (form is clean, or user confirmed discard).
   */
  onClose: () => void;
}

export interface DirtyDialogGuardResult {
  /**
   * Pass this as `onOpenChange` on the Radix `<Dialog>` component.
   * It intercepts close attempts when the form is dirty and shows the confirm dialog instead.
   */
  guardedOnOpenChange: (open: boolean) => void;
  /**
   * Whether the discard confirmation modal should be open.
   * Render `<ConfirmDiscardDialog open={isConfirmOpen} ... />` when true.
   */
  isConfirmOpen: boolean;
  /**
   * Call from `ConfirmDiscardDialog.onConfirm` — proceeds with closing the dialog.
   */
  confirmDiscard: () => void;
  /**
   * Call from `ConfirmDiscardDialog.onCancel` — dismisses the confirm dialog without closing.
   */
  cancelDiscard: () => void;
}

/**
 * useDirtyDialogGuard
 *
 * Intercepts dialog close attempts when the feature form has unsaved changes,
 * presenting the user with a `<ConfirmDiscardDialog>` before allowing the dialog to close.
 *
 * **Use this for dialog-embedded forms.** For page-level forms use `useDirtyGuard` instead,
 * which covers React Router route transitions and browser close events.
 *
 * **Safety invariants — the guard NEVER blocks when:**
 * - `isSubmitSuccessful` is `true`
 * - `isDirty` is `false`
 *
 * @example
 * ```tsx
 * const { formState: { isDirty, isSubmitSuccessful } } = useForm<EditUserForm>();
 *
 * const { guardedOnOpenChange, isConfirmOpen, confirmDiscard, cancelDiscard } =
 *   useDirtyDialogGuard({
 *     isDirty,
 *     isSubmitSuccessful,
 *     onClose: () => onOpenChange(false),
 *   });
 *
 * return (
 *   <>
 *     <Dialog open={open} onOpenChange={guardedOnOpenChange}>
 *       <DialogContent>
 *         <form ...>...</form>
 *       </DialogContent>
 *     </Dialog>
 *     <ConfirmDiscardDialog
 *       open={isConfirmOpen}
 *       onConfirm={confirmDiscard}
 *       onCancel={cancelDiscard}
 *     />
 *   </>
 * );
 * ```
 */
export function useDirtyDialogGuard({
  isDirty,
  isSubmitSuccessful,
  onClose,
}: DirtyDialogGuardOptions): DirtyDialogGuardResult {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  // Guard is active when form is dirty and not yet successfully submitted.
  const shouldBlock = isDirty && !isSubmitSuccessful;

  const guardedOnOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        // Opening the dialog — always allow.
        return;
      }
      // Attempting to close the dialog.
      if (shouldBlock) {
        // Form is dirty — show confirmation instead of closing.
        setIsConfirmOpen(true);
      } else {
        // Form is clean or submitted — close immediately.
        onClose();
      }
    },
    [shouldBlock, onClose],
  );

  const confirmDiscard = useCallback(() => {
    // User chose to discard — dismiss confirm modal and close the dialog.
    setIsConfirmOpen(false);
    onClose();
  }, [onClose]);

  const cancelDiscard = useCallback(() => {
    // User chose to keep editing — dismiss confirm modal, keep dialog open.
    setIsConfirmOpen(false);
  }, []);

  return {
    guardedOnOpenChange,
    isConfirmOpen,
    confirmDiscard,
    cancelDiscard,
  };
}
