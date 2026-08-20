import * as React from 'react';
import { Button, type ButtonProps } from '@kinergy-platform/ui';

export interface FormResetButtonProps extends Omit<ButtonProps, 'type' | 'onClick'> {
  /**
   * Callback invoked when the reset button is clicked.
   * Typically calls `form.reset()`.
   */
  onReset: () => void;
  /**
   * Whether the form's mutation / submission is currently in-flight.
   * When true, the reset button is disabled to prevent inconsistent state changes.
   */
  isPending?: boolean;
  /**
   * Alias for `isPending` for compatibility with React Hook Form's `formState.isSubmitting`.
   */
  isSubmitting?: boolean;
}

/**
 * FormResetButton
 *
 * Opt-in form reset trigger. Always renders as `type="button"` to avoid triggering
 * browser-default form submission.
 *
 * Only provide this component on forms where an explicit reset to initial values
 * is a valid, architecturally justified requirement.
 *
 * @example
 * ```tsx
 * <FormResetButton onReset={() => form.reset()} isPending={mutation.isPending}>
 *   Reset
 * </FormResetButton>
 * ```
 */
export const FormResetButton = React.forwardRef<HTMLButtonElement, FormResetButtonProps>(
  (
    {
      onReset,
      isPending = false,
      isSubmitting = false,
      variant = 'ghost',
      disabled = false,
      children = 'Reset',
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
        onClick={onReset}
        {...props}
      >
        {children}
      </Button>
    );
  },
);

FormResetButton.displayName = 'FormResetButton';
