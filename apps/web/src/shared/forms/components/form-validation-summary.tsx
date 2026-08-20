import * as React from 'react';
import {
  type FieldErrors,
  type FieldValues,
  type Path,
  type UseFormSetFocus,
  useFormContext,
} from 'react-hook-form';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle, cn } from '@kinergy-platform/ui';

export interface FormValidationErrorItem {
  /** Field path or name associated with the validation error */
  name: string;
  /** Human-readable error message */
  message: string;
}

export interface FormValidationSummaryProps<
  TFieldValues extends FieldValues = FieldValues,
> extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  /**
   * The `formState.errors` object from React Hook Form's `useForm`.
   * Optional if component is rendered within `<Form {...form}>` (FormProvider).
   */
  errors?: FieldErrors<TFieldValues>;
  /**
   * Whether the form has been submitted at least once.
   * Optional if component is rendered within `<Form {...form}>` (FormProvider).
   */
  isSubmitted?: boolean;
  /**
   * Optional override for the summary heading.
   * @default "Please fix the following errors"
   */
  title?: string;
  /**
   * When true, auto-focuses the summary alert container upon failed submission.
   * Ensures screen readers announce the error summary immediately.
   * @default true
   */
  autoFocus?: boolean;
  /**
   * When true, focuses the first invalid field upon failed submission instead of the summary alert.
   * @default false
   */
  focusFirstError?: boolean;
  /**
   * Optional custom field focus callback when clicking an error item in the summary.
   * If omitted, invokes `setFocus(fieldName)` from React Hook Form or DOM element `.focus()`.
   */
  onFocusField?: (fieldName: Path<TFieldValues>) => void;
  /**
   * Explicit React Hook Form `setFocus` function.
   * If omitted, retrieved automatically from `useFormContext` if available.
   */
  setFocus?: UseFormSetFocus<TFieldValues>;
}

/** Recursively extracts field names and messages from an RHF FieldErrors tree. */
export function extractValidationErrorItems(
  errors: FieldErrors,
  parentKey = '',
): FormValidationErrorItem[] {
  const items: FormValidationErrorItem[] = [];

  for (const [key, value] of Object.entries(errors)) {
    if (!value) continue;

    const fullKey = parentKey ? `${parentKey}.${key}` : key;

    if (typeof value.message === 'string' && value.message) {
      items.push({ name: fullKey, message: value.message });
    } else if (typeof value === 'object' && !('message' in value)) {
      // Nested error tree
      items.push(...extractValidationErrorItems(value as FieldErrors, fullKey));
    }
  }

  return items;
}

/**
 * FormValidationSummary Component
 *
 * Accessible validation error summary that aggregates and presents form-level errors.
 * Complies with WAI-ARIA alert practices:
 * - `role="alert"` for assertive screen reader announcement
 * - Focus management on failed submit without stealing focus during typing
 * - Clickable error items to quickly navigate/focus invalid fields via `setFocus()`
 * - Maintains individual field-level error messages alongside the summary
 *
 * @example
 * ```tsx
 * const form = useForm<FormValues>();
 *
 * <Form {...form}>
 *   <form onSubmit={form.handleSubmit(onSubmit)}>
 *     <FormValidationSummary />
 *     <FormField ... />
 *     <FormActions ... />
 *   </form>
 * </Form>
 * ```
 */
export function FormValidationSummary<TFieldValues extends FieldValues = FieldValues>({
  errors: propsErrors,
  isSubmitted: propsIsSubmitted,
  title = 'Please fix the following errors',
  autoFocus = true,
  focusFirstError = false,
  onFocusField,
  setFocus: propsSetFocus,
  className,
  id,
  ...props
}: FormValidationSummaryProps<TFieldValues>): React.ReactElement | null {
  const summaryRef = React.useRef<HTMLDivElement>(null);
  const formContext = useFormContext<TFieldValues>();

  const errors = propsErrors ?? formContext?.formState?.errors ?? ({} as FieldErrors<TFieldValues>);
  const isSubmitted = propsIsSubmitted ?? formContext?.formState?.isSubmitted ?? false;
  const setFocus = propsSetFocus ?? formContext?.setFocus;

  const errorItems = React.useMemo(
    () => extractValidationErrorItems(errors as FieldErrors),
    [errors],
  );
  const hasErrors = errorItems.length > 0;
  const isVisible = isSubmitted && hasErrors;

  // Track submission count to detect new submit failures and avoid stealing focus during normal typing
  const submitCount = formContext?.formState?.submitCount ?? (isSubmitted ? 1 : 0);
  const prevSubmitCountRef = React.useRef(submitCount);

  React.useEffect(() => {
    const isNewFailedSubmit = submitCount > prevSubmitCountRef.current && isVisible;
    prevSubmitCountRef.current = submitCount;

    if (isVisible && isNewFailedSubmit) {
      if (focusFirstError && errorItems[0]?.name) {
        const firstFieldName = errorItems[0].name as Path<TFieldValues>;
        if (setFocus) {
          setFocus(firstFieldName);
        }
        const element =
          document.querySelector<HTMLElement>(`[name="${firstFieldName}"]`) ||
          document.getElementById(firstFieldName) ||
          document.getElementById(`${firstFieldName}-form-item`);
        element?.focus();
      } else if (autoFocus && summaryRef.current) {
        summaryRef.current.focus();
      }
    }
  }, [isVisible, submitCount, autoFocus, focusFirstError, setFocus, errorItems]);

  if (!isVisible) {
    return null;
  }

  const handleFieldClick = (fieldName: string) => {
    if (onFocusField) {
      onFocusField(fieldName as Path<TFieldValues>);
    } else {
      if (setFocus) {
        setFocus(fieldName as Path<TFieldValues>);
      }
      const element =
        document.querySelector<HTMLElement>(`[name="${fieldName}"]`) ||
        document.getElementById(fieldName) ||
        document.getElementById(`${fieldName}-form-item`);
      element?.focus();
    }
  };

  return (
    <Alert
      ref={summaryRef}
      id={id}
      variant="destructive"
      role="alert"
      aria-live="assertive"
      tabIndex={autoFocus && !focusFirstError ? -1 : undefined}
      className={cn('focus:outline-none', className)}
      {...props}
    >
      <AlertCircle className="h-4 w-4 shrink-0" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <ul className="mt-1 list-inside list-disc space-y-1 text-xs">
          {errorItems.map((item, index) => (
            <li key={`${item.name}-${index}`}>
              <button
                type="button"
                data-testid={`validation-summary-item-${item.name}`}
                onClick={() => handleFieldClick(item.name)}
                className="cursor-pointer text-left underline underline-offset-2 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-xs"
              >
                {item.message}
              </button>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

FormValidationSummary.displayName = 'FormValidationSummary';
