import * as React from 'react';
import type { FieldErrors, FieldValues } from 'react-hook-form';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle, cn } from '@kinergy-platform/ui';

export interface FormValidationSummaryProps<
  TFieldValues extends FieldValues = FieldValues,
> extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  /**
   * The `formState.errors` object from React Hook Form's `useForm`.
   */
  errors: FieldErrors<TFieldValues>;
  /**
   * Whether the form has been submitted at least once.
   * The summary is only visible after a submission attempt.
   * Corresponds to `formState.isSubmitted` from RHF.
   */
  isSubmitted: boolean;
  /**
   * Optional override for the summary heading.
   * @default "Please fix the following errors"
   */
  title?: string;
  /**
   * When true, the summary auto-focuses itself on first render when errors are present.
   * This ensures screen readers announce the error list immediately after a failed submit.
   * @default true
   */
  autoFocus?: boolean;
}

/** Recursively extract all string messages from an RHF FieldErrors tree. */
function extractErrorMessages(errors: FieldErrors): string[] {
  const messages: string[] = [];

  for (const value of Object.values(errors)) {
    if (!value) continue;

    if (typeof value.message === 'string' && value.message) {
      messages.push(value.message);
    } else if (typeof value === 'object' && !('message' in value)) {
      // Nested object (e.g., nested schema)
      messages.push(...extractErrorMessages(value as FieldErrors));
    }
  }

  return messages;
}

/**
 * FormValidationSummary
 *
 * Accessible validation error summary that aggregates all field errors into a single
 * announced region. Intended for page forms where the submit button may be far from
 * the individual field errors.
 *
 * **Opt-in**: Dialog forms should not include this; they rely on inline `FormErrorMessage`
 * per field. Page-level forms with many fields benefit most.
 *
 * Visibility: Only renders when `isSubmitted && hasErrors` to avoid showing on mount.
 *
 * Accessibility:
 * - `role="alert"` — announces immediately when rendered
 * - `aria-live="assertive"` — assertive live region for error announcements
 * - Auto-focuses on first visible render so keyboard users know where to look
 *
 * @example
 * ```tsx
 * const { formState: { errors, isSubmitted } } = useForm<MySchema>();
 *
 * <FormValidationSummary errors={errors} isSubmitted={isSubmitted} />
 * <FormLayout variant="page">
 *   ...
 * </FormLayout>
 * ```
 */
export function FormValidationSummary<TFieldValues extends FieldValues = FieldValues>({
  errors,
  isSubmitted,
  title = 'Please fix the following errors',
  autoFocus = true,
  className,
  id,
  ...props
}: FormValidationSummaryProps<TFieldValues>) {
  const summaryRef = React.useRef<HTMLDivElement>(null);
  const errorMessages = extractErrorMessages(errors as FieldErrors);
  const hasErrors = errorMessages.length > 0;
  const isVisible = isSubmitted && hasErrors;

  // Focus the summary div the first time it becomes visible so screen readers
  // announce it immediately after a failed submission attempt.
  React.useEffect(() => {
    if (isVisible && autoFocus && summaryRef.current) {
      summaryRef.current.focus();
    }
  }, [isVisible, autoFocus]);

  if (!isVisible) {
    return null;
  }

  return (
    <Alert
      ref={summaryRef}
      id={id}
      variant="destructive"
      role="alert"
      aria-live="assertive"
      tabIndex={autoFocus ? -1 : undefined}
      className={cn('focus:outline-none', className)}
      {...props}
    >
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
          {errorMessages.map((message, index) => (
            <li key={index}>{message}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

FormValidationSummary.displayName = 'FormValidationSummary';
