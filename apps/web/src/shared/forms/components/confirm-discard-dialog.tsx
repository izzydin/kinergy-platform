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
import { useTranslation } from '../../../app/providers/locale-provider';

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
  title,
  description,
  confirmLabel,
  cancelLabel,
}) => {
  const cancelBtnRef = React.useRef<HTMLButtonElement>(null);
  const { locale, t } = useTranslation();

  const resolvedTitle =
    title ??
    (locale === 'es'
      ? t('crud.discardModalTitle', '¿Descartar cambios sin guardar?')
      : 'Discard unsaved changes?');
  const resolvedDescription =
    description ??
    (locale === 'es'
      ? t(
          'crud.discardModalDescription',
          'Tienes modificaciones sin guardar que se perderán si sales de esta pantalla.',
        )
      : 'You have unsaved changes that will be lost if you leave this page. Are you sure you want to discard them?');
  const resolvedConfirmLabel =
    confirmLabel ??
    (locale === 'es' ? t('crud.discardChanges', 'Descartar cambios') : 'Discard changes');
  const resolvedCancelLabel =
    cancelLabel ?? (locale === 'es' ? t('crud.keepEditing', 'Seguir editando') : 'Keep editing');

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        // Escape key / outside click → cancel (keep editing)
        if (!nextOpen) onCancel();
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        hideCloseButton
        data-testid="confirm-discard-dialog"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          cancelBtnRef.current?.focus();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onCancel();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{resolvedTitle}</DialogTitle>
          <DialogDescription>{resolvedDescription}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            ref={cancelBtnRef}
            type="button"
            variant="outline"
            onClick={onCancel}
            data-testid="confirm-discard-cancel-btn"
          >
            {resolvedCancelLabel}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            data-testid="confirm-discard-confirm-btn"
          >
            {resolvedConfirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

ConfirmDiscardDialog.displayName = 'ConfirmDiscardDialog';
