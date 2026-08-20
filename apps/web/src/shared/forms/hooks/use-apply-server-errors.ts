import { useCallback } from 'react';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ValidationError } from '../../query';

/**
 * The normalized server-side validation error detail shape.
 * Matches the `ValidationError.details` structure produced by `ApiExceptionFilter`
 * (NestJS class-validator errors normalized by the backend).
 *
 * Example payload:
 * ```json
 * {
 *   "email": ["must be a valid email address"],
 *   "name": ["must be at least 2 characters", "must be a string"]
 * }
 * ```
 */
export type ServerValidationDetails = Record<string, string[]>;

/**
 * useApplyServerErrors
 *
 * Bridges the gap between the backend's normalized `ValidationError.details`
 * and React Hook Form's `setError()`.
 *
 * Called in a mutation's `onError` handler to map server field errors back
 * into the form's error state, rendering them as inline `FormErrorMessage` nodes
 * and (if present) in `FormValidationSummary`.
 *
 * Unknown fields (not present in the form schema) are silently ignored unless
 * a fallback field name is provided — in that case, aggregated errors are
 * displayed under the fallback field.
 *
 * @param setError - React Hook Form's `setError` function from `useForm`.
 *
 * @returns `applyServerErrors(error)` — call this in your mutation's `onError`.
 *
 * @example
 * ```tsx
 * const { setError, ... } = useForm<CreateUserFormValues>();
 * const applyServerErrors = useApplyServerErrors(setError);
 *
 * const mutation = useCreateUserMutation({
 *   onError: (error) => {
 *     if (error instanceof ValidationError) {
 *       applyServerErrors(error);
 *     }
 *   },
 * });
 * ```
 */
export function useApplyServerErrors<TFieldValues extends FieldValues>(
  setError: UseFormSetError<TFieldValues>,
): (error: ValidationError, options?: ApplyServerErrorsOptions<TFieldValues>) => void {
  return useCallback(
    (error: ValidationError, options?: ApplyServerErrorsOptions<TFieldValues>) => {
      const details = error.details;
      if (!details || typeof details !== 'object') return;

      const unknownMessages: string[] = [];

      for (const [field, messages] of Object.entries(details)) {
        if (!messages?.length) continue;

        // Combine multiple messages for the same field into one readable string
        const combinedMessage = messages.join('. ');

        // Attempt to set the error on the matching form field.
        // RHF does not throw for unknown field names; unknown fields are silently
        // collected for the fallback field.
        setError(field as Path<TFieldValues>, {
          type: 'server',
          message: combinedMessage,
        });

        // Track messages for fields that cannot be mapped visually
        // (feature can use fallbackField to surface them via root error or a sentinel field)
        if (options?.fallbackField && !(field in (error.details ?? {}))) {
          unknownMessages.push(combinedMessage);
        }
      }

      // If a fallback field is provided, surface unknown/unmapped errors there
      if (options?.fallbackField && unknownMessages.length > 0) {
        setError(options.fallbackField, {
          type: 'server',
          message: unknownMessages.join('. '),
        });
      }
    },
    [setError],
  );
}

export interface ApplyServerErrorsOptions<TFieldValues extends FieldValues> {
  /**
   * Field name to receive any server error messages that could not be mapped
   * to a known form field. Useful for surfacing unexpected server-side validation
   * rejections without losing the error message.
   *
   * @example `fallbackField: 'root'` (RHF root-level errors)
   */
  fallbackField?: Path<TFieldValues>;
}
