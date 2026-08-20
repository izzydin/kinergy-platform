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

export interface ApplyServerErrorsOptions<TFieldValues extends FieldValues> {
  /**
   * Optional list of known form field names. If provided, any error key from the server
   * that is not in this list will be collected and applied to `fallbackField`.
   */
  knownFields?: Array<Path<TFieldValues> | string>;
  /**
   * Field name to receive any server error messages that could not be mapped
   * to a known form field or are designated as global/root errors.
   *
   * @default 'root' (if knownFields is provided and unmapped fields exist)
   */
  fallbackField?: Path<TFieldValues>;
}

/**
 * useApplyServerErrors
 *
 * Bridges backend normalized `ValidationError.details` into React Hook Form's `setError()`.
 *
 * Called in a mutation's `onError` handler to map server validation errors into the form's
 * error state, rendering them as inline `FormMessage` nodes and in `FormValidationSummary`.
 *
 * Generic server errors (500, network loss, 401) should be handled via standard notification
 * or error boundaries, not injected as form validation errors.
 *
 * @param setError - React Hook Form's `setError` function from `useForm`.
 * @returns `applyServerErrors(error, options)`
 *
 * @example
 * ```tsx
 * const { setError } = useForm<CreateUserFormValues>();
 * const applyServerErrors = useApplyServerErrors(setError);
 *
 * const mutation = useCreateUserMutation({
 *   onError: (error) => {
 *     if (error instanceof ValidationError) {
 *       applyServerErrors(error, { fallbackField: 'root' });
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

      const knownFieldsSet = options?.knownFields ? new Set(options.knownFields) : null;
      const unknownMessages: string[] = [];

      for (const [field, messages] of Object.entries(details)) {
        if (!messages?.length) continue;

        // Combine multiple messages for the same field into one readable string
        const combinedMessage = messages.join('. ');

        const isKnown = knownFieldsSet ? knownFieldsSet.has(field) : true;

        if (isKnown) {
          setError(field as Path<TFieldValues>, {
            type: 'server',
            message: combinedMessage,
          });
        } else {
          unknownMessages.push(combinedMessage);
        }
      }

      // If unknown messages exist and a fallback field is provided, assign them
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
