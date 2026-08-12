import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useMemo, useRef } from 'react';
import type { FieldErrors, UseFormReturn } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import {
  AuthenticationError,
  NetworkError,
  RateLimitError,
  ValidationError,
} from '../../../../shared/api/api-error';
import { useLoginMutation } from '../api/use-login-mutation';
import { loginSchema } from '../domain/login.schema';
import type { LoginRequest, LoginResult, LoginState } from '../domain/login.types';

export interface UseLoginFormReturn {
  readonly form: UseFormReturn<LoginRequest>;
  readonly errors: FieldErrors<LoginRequest>;
  readonly isValid: boolean;
  readonly isSubmitting: boolean;
  readonly isPending: boolean;
  readonly authError: string | null;
  readonly loginState: LoginState;
  readonly handleSubmit: (e?: React.BaseSyntheticEvent) => Promise<void>;
  readonly resetForm: () => void;
}

/**
 * Maps normalized ApiError to a secure, user-friendly form-level alert message.
 *
 * Enforces generic authentication error messaging for 401 Unauthorized responses to
 * prevent email enumeration side-channel vulnerabilities.
 */
export function mapAuthErrorMessage(error: unknown): string | null {
  if (!error) return null;

  if (error instanceof ValidationError || (error as { statusCode?: number }).statusCode === 400) {
    return 'Please review the form fields for errors and try again.';
  }

  if (
    error instanceof AuthenticationError ||
    (error as { statusCode?: number }).statusCode === 401 ||
    (error as { statusCode?: number }).statusCode === 403
  ) {
    return 'Invalid email or password.';
  }

  if (error instanceof RateLimitError || (error as { statusCode?: number }).statusCode === 429) {
    return 'Too many login attempts. Please wait a moment before trying again.';
  }

  if (error instanceof NetworkError || (error as { statusCode?: number }).statusCode === 0) {
    return 'Network connection lost. Please check your internet connection and try again.';
  }

  return 'An unexpected server error occurred. Please try again later.';
}

/**
 * Login Form Management Hook (`useLoginForm`)
 *
 * Primary application interface for managing login form state and mutation lifecycle:
 * - Form values and field validation driven strictly by React Hook Form + Zod (`loginSchema`).
 * - Integrates TanStack Query `useLoginMutation()` for authoritative server authentication.
 * - Prevents duplicate form submissions while a request is in-flight (`isPending` / `isSubmitting`).
 * - Form-level error presentation decoupled from internal token mechanics.
 */
export function useLoginForm(): UseLoginFormReturn {
  const mutation = useLoginMutation();
  const isSubmittingRef = useRef(false);

  const form = useForm<LoginRequest>({
    resolver: zodResolver(loginSchema),
    mode: 'onTouched',
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const {
    handleSubmit: rhfHandleSubmit,
    formState: { errors, isValid, isSubmitting: rhfIsSubmitting },
    reset: rhfReset,
  } = form;

  const isPending = mutation.isPending;
  const isSubmitting = rhfIsSubmitting || isPending || isSubmittingRef.current;

  const authError = useMemo(() => {
    return mapAuthErrorMessage(mutation.error);
  }, [mutation.error]);

  const onSubmit = useCallback(
    async (values: LoginRequest): Promise<LoginResult> => {
      // Guard against duplicate submissions while a request is in-flight
      if (isSubmittingRef.current || isPending) {
        return {
          success: false,
          user: null,
          redirectPath: '/auth/login',
          error: null,
        };
      }

      isSubmittingRef.current = true;
      try {
        return await mutation.mutateAsync(values);
      } finally {
        isSubmittingRef.current = false;
      }
    },
    [isPending, mutation],
  );

  const handleSubmit = useMemo(() => {
    return rhfHandleSubmit(async (values) => {
      try {
        await onSubmit(values);
      } catch {
        // Errors are normalized and exposed via mutation.error & authError
      }
    });
  }, [rhfHandleSubmit, onSubmit]);

  const resetForm = useCallback(() => {
    isSubmittingRef.current = false;
    rhfReset({ email: '', password: '' });
    mutation.resetState();
  }, [mutation, rhfReset]);

  return {
    form,
    errors,
    isValid,
    isSubmitting,
    isPending,
    authError,
    loginState: mutation.loginState,
    handleSubmit,
    resetForm,
  };
}
