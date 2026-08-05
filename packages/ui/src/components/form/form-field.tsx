import * as React from 'react';
import type { BaseComponentProps, SemanticStateProps } from '../../contracts';
import { cn } from '../../primitives/cn';

export interface FormFieldContextValue {
  id: string;
  isInvalid?: boolean;
  helperId?: string;
  errorId?: string;
}

const FormFieldContext = React.createContext<FormFieldContextValue | null>(null);

/**
 * Access active FormField context metadata
 */
export function useFormField(): FormFieldContextValue {
  const context = React.useContext(FormFieldContext);
  return context ?? { id: '', isInvalid: false };
}

export interface FormFieldProps
  extends React.HTMLAttributes<HTMLDivElement>, BaseComponentProps, SemanticStateProps {
  /** Optional explicit input element ID (auto-generated via React.useId if omitted) */
  controlId?: string;
}

/**
 * FormField Primitive Container
 *
 * Provides accessibility context, unique control IDs, and validation error linking
 * to child form elements.
 */
export const FormField = React.forwardRef<HTMLDivElement, FormFieldProps>(
  ({ className, controlId, isInvalid = false, children, ...props }, ref) => {
    const autoId = React.useId();
    const id = controlId || autoId;
    const helperId = `${id}-helper`;
    const errorId = `${id}-error`;

    const value = React.useMemo<FormFieldContextValue>(
      () => ({
        id,
        isInvalid,
        helperId,
        errorId,
      }),
      [id, isInvalid, helperId, errorId],
    );

    return (
      <FormFieldContext.Provider value={value}>
        <div ref={ref} className={cn('space-y-1.5', className)} {...props}>
          {children}
        </div>
      </FormFieldContext.Provider>
    );
  },
);
FormField.displayName = 'FormField';

export interface FormLabelProps
  extends React.LabelHTMLAttributes<HTMLLabelElement>, BaseComponentProps {
  required?: boolean;
}

/**
 * FormLabel Primitive
 *
 * Accessible label element linked to control via htmlFor and updated dynamically on validation state.
 */
export const FormLabel = React.forwardRef<HTMLLabelElement, FormLabelProps>(
  ({ className, required = false, children, htmlFor, ...props }, ref) => {
    const field = useFormField();
    const targetId = htmlFor || field.id;

    return (
      <label
        ref={ref}
        htmlFor={targetId}
        className={cn(
          'block text-sm font-medium leading-none text-foreground select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
          field.isInvalid && 'text-destructive',
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

export interface FormControlProps extends BaseComponentProps {
  children: React.ReactElement;
}

/**
 * FormControl Primitive
 *
 * Injects `id`, `aria-describedby`, and `aria-invalid` attributes into child control.
 */
export const FormControl = React.forwardRef<HTMLElement, FormControlProps>(({ children }, ref) => {
  const field = useFormField();
  const describedBy =
    [field.helperId, field.isInvalid ? field.errorId : null].filter(Boolean).join(' ') || undefined;

  return React.cloneElement(children, {
    ref,
    id: children.props.id || field.id || undefined,
    'aria-describedby': children.props['aria-describedby'] || describedBy,
    'aria-invalid': children.props['aria-invalid'] ?? (field.isInvalid ? true : undefined),
    isInvalid: children.props.isInvalid ?? field.isInvalid,
  });
});
FormControl.displayName = 'FormControl';

export interface FormHelperTextProps
  extends React.HTMLAttributes<HTMLParagraphElement>, BaseComponentProps {}

/**
 * FormHelperText Primitive
 */
export const FormHelperText = React.forwardRef<HTMLParagraphElement, FormHelperTextProps>(
  ({ className, id, ...props }, ref) => {
    const field = useFormField();
    const helperId = id || field.helperId;

    return (
      <p
        ref={ref}
        id={helperId}
        className={cn('text-xs text-muted-foreground', className)}
        {...props}
      />
    );
  },
);
FormHelperText.displayName = 'FormHelperText';

export interface FormErrorMessageProps
  extends React.HTMLAttributes<HTMLParagraphElement>, BaseComponentProps {}

/**
 * FormErrorMessage Primitive
 *
 * Accessible validation error message with role="alert".
 */
export const FormErrorMessage = React.forwardRef<HTMLParagraphElement, FormErrorMessageProps>(
  ({ className, id, children, ...props }, ref) => {
    const field = useFormField();
    const errorId = id || field.errorId;

    if (!field.isInvalid && !children) {
      return null;
    }

    return (
      <p
        ref={ref}
        id={errorId}
        role="alert"
        className={cn('text-xs font-medium text-destructive', className)}
        {...props}
      >
        {children}
      </p>
    );
  },
);
FormErrorMessage.displayName = 'FormErrorMessage';
