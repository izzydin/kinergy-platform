import * as React from 'react';
import { Button, type ButtonProps } from '@kinergy-platform/ui';

export interface FormSubmitButtonProps extends Omit<ButtonProps, 'type' | 'isLoading'> {
  /**
   * Whether the form's mutation / submission is currently in-flight.
   * Drives `isLoading`, `aria-busy`, and `disabled` on the underlying Button
   * to prevent duplicate submissions.
   */
  isPending?: boolean;
  /**
   * Alias for `isPending` for compatibility with React Hook Form's `formState.isSubmitting`.
   */
  isSubmitting?: boolean;
  /**
   * Text announced to screen readers and displayed while the mutation is pending.
   * If omitted, the default children text remains visible with the loading spinner.
   */
  loadingText?: string;
  /**
   * When the form element is outside the button's DOM subtree, provide the
   * form's `id` here to associate submission via the native HTML `form` attribute.
   */
  form?: string;
}

/**
 * FormSubmitButton
 *
 * Standardized form submission trigger. Always renders as `type="submit"`.
 * Reflects the feature's mutation / submission state via `isPending` or `isSubmitting`,
 * which activates the loading spinner, sets `aria-busy="true"`, and disables the button
 * to prevent duplicate submissions.
 *
 * The framework does NOT own the mutation. The feature passes `mutation.isPending`
 * or `form.formState.isSubmitting`.
 *
 * Keyboard: pressing `Enter` in any text input within the associated form triggers
 * native form submission.
 *
 * @example
 * ```tsx
 * const mutation = useUpdateUserMutation();
 *
 * <FormSubmitButton isPending={mutation.isPending} loadingText="Saving...">
 *   Save Changes
 * </FormSubmitButton>
 * ```
 *
 * @example — cross-element (button outside the form element, e.g. in DialogFooter)
 * ```tsx
 * <form id="edit-user-form" onSubmit={handleSubmit(onSubmit)}>
 *   ...
 * </form>
 * <DialogFooter>
 *   <FormSubmitButton isPending={isPending} form="edit-user-form">
 *     Save
 *   </FormSubmitButton>
 * </DialogFooter>
 * ```
 */
export const FormSubmitButton = React.forwardRef<HTMLButtonElement, FormSubmitButtonProps>(
  (
    {
      isPending = false,
      isSubmitting = false,
      loadingText,
      form,
      disabled = false,
      children,
      ...props
    },
    ref,
  ) => {
    const isBusy = Boolean(isPending || isSubmitting);
    const isControlDisabled = Boolean(disabled || isBusy);

    return (
      <Button
        ref={ref}
        type="submit"
        form={form}
        isLoading={isBusy}
        loadingText={loadingText}
        disabled={isControlDisabled}
        {...props}
      >
        {children}
      </Button>
    );
  },
);

FormSubmitButton.displayName = 'FormSubmitButton';
