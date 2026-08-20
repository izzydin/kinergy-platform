import * as React from 'react';
import { Button, type ButtonProps } from '@kinergy-platform/ui';

export interface FormSubmitButtonProps extends Omit<
  ButtonProps,
  'type' | 'isLoading' | 'disabled'
> {
  /**
   * Whether the form's mutation is currently pending.
   * Drives `isLoading` and `disabled` on the underlying Button.
   */
  isPending?: boolean;
  /**
   * Text announced to screen readers while the mutation is pending.
   * Falls back to the button children if not provided.
   */
  loadingText?: string;
  /**
   * When the form element is outside the button's DOM subtree, provide the
   * form's `id` here to associate submission via the `form` attribute.
   */
  form?: string;
}

/**
 * FormSubmitButton
 *
 * Standardized form submission trigger. Always renders as `type="submit"`.
 * Reflects the feature's mutation pending state via `isPending`, which drives
 * both the loading spinner and disabled state.
 *
 * The framework does NOT own the mutation. The feature passes `mutation.isPending`.
 *
 * Keyboard: pressing `Enter` in any text field within the same `<form>` triggers
 * this button via native form submission.
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
 * @example — cross-element (button outside the form element)
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
  ({ isPending = false, loadingText, form, children, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        type="submit"
        form={form}
        isLoading={isPending}
        loadingText={loadingText}
        disabled={isPending}
        {...props}
      >
        {children}
      </Button>
    );
  },
);

FormSubmitButton.displayName = 'FormSubmitButton';
