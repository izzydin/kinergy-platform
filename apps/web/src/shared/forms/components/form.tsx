import * as React from 'react';
import {
  Controller,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
  FormProvider,
  useFormContext,
} from 'react-hook-form';
import { Slot } from '@kinergy-platform/ui';
import type { BaseComponentProps } from '@kinergy-platform/ui';
import { cn } from '@kinergy-platform/ui';

/**
 * Form Provider Component
 *
 * Provides React Hook Form context to nested form fields.
 * Re-exports RHF's FormProvider for consistent module consumption.
 */
export const Form = FormProvider;

export interface FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> {
  name: TName;
}

export const FormFieldContext = React.createContext<FormFieldContextValue | null>(null);

/**
 * FormField Component
 *
 * Connects an individual field to React Hook Form's Controller and injects
 * field context for nested FormItem, FormLabel, FormControl, and FormMessage.
 *
 * @example
 * ```tsx
 * <FormField
 *   control={form.control}
 *   name="email"
 *   render={({ field }) => (
 *     <FormItem>
 *       <FormLabel required>Email</FormLabel>
 *       <FormControl>
 *         <Input placeholder="name@domain.com" {...field} />
 *       </FormControl>
 *       <FormDescription>Your account email address.</FormDescription>
 *       <FormMessage />
 *     </FormItem>
 *   )}
 * />
 * ```
 */
export const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  ...props
}: ControllerProps<TFieldValues, TName>): React.ReactElement => {
  const value = React.useMemo(() => ({ name: props.name }), [props.name]);

  return (
    <FormFieldContext.Provider value={value}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
};

export interface FormItemContextValue {
  id: string;
}

export const FormItemContext = React.createContext<FormItemContextValue | null>(null);

/**
 * useFormField Hook
 *
 * Accesses active field metadata, state, and generated accessible element IDs.
 */
export function useFormField() {
  const fieldContext = React.useContext(FormFieldContext);
  const itemContext = React.useContext(FormItemContext);
  const formContext = useFormContext();

  const generatedId = React.useId();
  const id = itemContext?.id ?? generatedId;

  const fieldState =
    fieldContext?.name && formContext
      ? formContext.getFieldState(fieldContext.name, formContext.formState)
      : undefined;

  return {
    id,
    name: fieldContext?.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    isInvalid: Boolean(fieldState?.error),
    ...fieldState,
  };
}

export interface FormItemProps extends React.HTMLAttributes<HTMLDivElement>, BaseComponentProps {}

/**
 * FormItem Component
 *
 * Accessible container for a form control, generating a unique ID context
 * shared across label, control, description, and error message.
 */
export const FormItem = React.forwardRef<HTMLDivElement, FormItemProps>(
  ({ className, ...props }, ref) => {
    const id = React.useId();
    const value = React.useMemo(() => ({ id }), [id]);

    return (
      <FormItemContext.Provider value={value}>
        <div ref={ref} className={cn('space-y-1.5', className)} {...props} />
      </FormItemContext.Provider>
    );
  },
);
FormItem.displayName = 'FormItem';

export interface FormLabelProps
  extends React.LabelHTMLAttributes<HTMLLabelElement>, BaseComponentProps {
  /** When true, renders a required indicator asterisk */
  required?: boolean;
}

/**
 * FormLabel Component
 *
 * Accessible label element automatically linked to the FormControl via `htmlFor`.
 * Shows error styling when the field state is invalid.
 */
export const FormLabel = React.forwardRef<HTMLLabelElement, FormLabelProps>(
  ({ className, required = false, children, htmlFor, ...props }, ref) => {
    const { error, formItemId } = useFormField();
    const targetId = htmlFor || formItemId;

    return (
      <label
        ref={ref}
        htmlFor={targetId}
        className={cn(
          'block text-sm font-medium leading-none text-foreground select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
          error && 'text-destructive',
          className,
        )}
        {...props}
      >
        {children}
        {required && (
          <span className="ml-1 text-destructive" aria-hidden="true">
            *
          </span>
        )}
      </label>
    );
  },
);
FormLabel.displayName = 'FormLabel';

export interface FormControlProps
  extends React.ComponentPropsWithoutRef<typeof Slot>, BaseComponentProps {}

/**
 * FormControl Component
 *
 * Injects accessible `id`, `aria-describedby`, and `aria-invalid` attributes
 * into the child input control using polymorphic slot composition.
 */
export const FormControl = React.forwardRef<React.ElementRef<typeof Slot>, FormControlProps>(
  ({ ...props }, ref) => {
    const { error, formItemId, formDescriptionId, formMessageId } = useFormField();

    const describedBy = error ? `${formDescriptionId} ${formMessageId}` : formDescriptionId;

    return (
      <Slot
        ref={ref}
        id={formItemId}
        aria-describedby={describedBy}
        aria-invalid={Boolean(error)}
        {...props}
      />
    );
  },
);
FormControl.displayName = 'FormControl';

export interface FormDescriptionProps
  extends React.HTMLAttributes<HTMLParagraphElement>, BaseComponentProps {}

/**
 * FormDescription Component
 *
 * Accessible helper / description text for a form field.
 */
export const FormDescription = React.forwardRef<HTMLParagraphElement, FormDescriptionProps>(
  ({ className, id, ...props }, ref) => {
    const { formDescriptionId } = useFormField();
    const targetId = id || formDescriptionId;

    return (
      <p
        ref={ref}
        id={targetId}
        className={cn('text-xs text-muted-foreground', className)}
        {...props}
      />
    );
  },
);
FormDescription.displayName = 'FormDescription';

export interface FormMessageProps
  extends React.HTMLAttributes<HTMLParagraphElement>, BaseComponentProps {}

/**
 * FormMessage Component
 *
 * Accessible validation error message linked to the field control with `role="alert"`.
 * Automatically extracts the error message from React Hook Form field state.
 */
export const FormMessage = React.forwardRef<HTMLParagraphElement, FormMessageProps>(
  ({ className, children, id, ...props }, ref) => {
    const { error, formMessageId } = useFormField();
    const targetId = id || formMessageId;
    const body = error ? String(error?.message ?? '') : children;

    if (!body) {
      return null;
    }

    return (
      <p
        ref={ref}
        id={targetId}
        role="alert"
        className={cn('text-xs font-medium text-destructive', className)}
        {...props}
      >
        {body}
      </p>
    );
  },
);
FormMessage.displayName = 'FormMessage';
