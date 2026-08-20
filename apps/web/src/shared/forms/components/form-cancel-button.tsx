import * as React from 'react';
import { Button, type ButtonProps } from '@kinergy-platform/ui';

export interface FormCancelButtonProps extends Omit<ButtonProps, 'type' | 'onClick'> {
  /**
   * Callback invoked when the cancel button is clicked.
   * Typically closes a dialog or navigates back.
   */
  onCancel: () => void;
  /**
   * Whether the form's mutation is currently pending.
   * When true, the cancel button is disabled to prevent interrupting an in-flight request.
   */
  isPending?: boolean;
}

/**
 * FormCancelButton
 *
 * Standardized form cancellation / dismissal trigger. Always renders as `type="button"`
 * to prevent accidental form submission.
 *
 * Disabled automatically when `isPending` to prevent interrupting an in-flight mutation.
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
    { onCancel, isPending = false, variant = 'outline', disabled, children = 'Cancel', ...props },
    ref,
  ) => {
    return (
      <Button
        ref={ref}
        type="button"
        variant={variant}
        disabled={isPending || disabled}
        onClick={onCancel}
        {...props}
      >
        {children}
      </Button>
    );
  },
);

FormCancelButton.displayName = 'FormCancelButton';
