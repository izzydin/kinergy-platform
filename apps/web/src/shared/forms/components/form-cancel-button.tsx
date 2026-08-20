import * as React from 'react';
import { Button, type ButtonProps } from '@kinergy-platform/ui';

export interface FormCancelButtonProps extends Omit<ButtonProps, 'type' | 'onClick'> {
  /**
   * Callback invoked when the cancel button is clicked.
   * Typically closes a dialog, dismisses a drawer, or navigates back.
   */
  onCancel: () => void;
  /**
   * Whether the form's mutation is currently pending.
   * When true, the cancel button is disabled to prevent interrupting an in-flight request.
   */
  isPending?: boolean;
  /**
   * Alias for `isPending` for compatibility with React Hook Form's `formState.isSubmitting`.
   */
  isSubmitting?: boolean;
}

/**
 * FormCancelButton
 *
 * Standardized form cancellation / dismissal trigger. Always renders as `type="button"`
 * to prevent accidental form submission.
 *
 * Automatically disabled when `isPending` or `isSubmitting` to prevent interrupting
 * an in-flight mutation or request.
 *
 * @example
 * ```tsx
 * <FormCancelButton onCancel={() => onOpenChange(false)} isPending={mutation.isPending}>
 *   Cancel
 * </FormCancelButton>
 * ```
 *
 * @example — with navigation (page form)
 * ```tsx
 * <FormCancelButton onCancel={() => navigate(-1)} isPending={isPending} />
 * ```
 */
export const FormCancelButton = React.forwardRef<HTMLButtonElement, FormCancelButtonProps>(
  (
    {
      onCancel,
      isPending = false,
      isSubmitting = false,
      variant = 'outline',
      disabled = false,
      children = 'Cancel',
      ...props
    },
    ref,
  ) => {
    const isBusy = Boolean(isPending || isSubmitting);
    const isControlDisabled = Boolean(disabled || isBusy);

    return (
      <Button
        ref={ref}
        type="button"
        variant={variant}
        disabled={isControlDisabled}
        onClick={onCancel}
        {...props}
      >
        {children}
      </Button>
    );
  },
);

FormCancelButton.displayName = 'FormCancelButton';
