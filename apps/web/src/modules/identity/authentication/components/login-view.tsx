import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FormControl,
  FormErrorMessage,
  FormField,
  FormLabel,
  Input,
  PasswordInput,
  cn,
} from '@kinergy-platform/ui';
import { AlertCircle } from 'lucide-react';
import React from 'react';
import { useLoginForm } from '../hooks/use-login-form';

export interface LoginViewProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Optional completion callback triggered after successful login */
  readonly onSuccess?: () => void;
}

/**
 * Production Login Screen View Component (`LoginView`)
 *
 * Consumes `useLoginForm()` to provide an accessible, responsive, themed authentication screen:
 * - Built exclusively with `@kinergy/ui` design system components (`Card`, `Input`, `PasswordInput`, `Button`, `Alert`).
 * - WCAG 2.1 AA accessible (`aria-invalid`, `aria-describedby`, `htmlFor`, keyboard navigation, password visibility toggle).
 * - Full light & dark mode support via semantic design tokens.
 * - Form-level error presentation for authentication failures.
 */
export const LoginView = React.forwardRef<HTMLDivElement, LoginViewProps>(
  ({ className, onSuccess, ...props }, ref) => {
    const { form, errors, isSubmitting, authError, handleSubmit } = useLoginForm({ onSuccess });

    const onSubmitForm = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      await handleSubmit(e);
    };

    return (
      <Card
        ref={ref}
        className={cn('w-full border-none bg-transparent shadow-none', className)}
        {...props}
      >
        <CardHeader className="p-0 pb-6 text-center">
          <CardTitle as="h1" className="text-2xl font-bold tracking-tight text-foreground">
            Sign In
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Enter your credentials to access your account
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          <form
            onSubmit={(e) => void onSubmitForm(e)}
            className="space-y-4"
            noValidate
            aria-label="Sign in to your Kinergy account"
          >
            {authError ? (
              <Alert variant="destructive" className="animate-in fade-in-50 duration-200">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Authentication Failed</AlertTitle>
                <AlertDescription>{authError}</AlertDescription>
              </Alert>
            ) : null}

            <FormField>
              <FormLabel htmlFor="login-email" required>
                Email Address
              </FormLabel>
              <FormControl>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="name@company.com"
                  autoComplete="username"
                  disabled={isSubmitting}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? 'login-email-error' : 'login-email-helper'}
                  {...form.register('email')}
                />
              </FormControl>
              {errors.email ? (
                <FormErrorMessage id="login-email-error">{errors.email.message}</FormErrorMessage>
              ) : null}
            </FormField>

            <FormField>
              <FormLabel htmlFor="login-password" required>
                Password
              </FormLabel>
              <FormControl>
                <PasswordInput
                  id="login-password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  disabled={isSubmitting}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={
                    errors.password ? 'login-password-error' : 'login-password-helper'
                  }
                  {...form.register('password')}
                />
              </FormControl>
              {errors.password ? (
                <FormErrorMessage id="login-password-error">
                  {errors.password.message}
                </FormErrorMessage>
              ) : null}
            </FormField>

            <Button
              type="submit"
              className="mt-6 w-full shadow-md transition-all duration-150 active:scale-[0.99]"
              disabled={isSubmitting}
              isLoading={isSubmitting}
            >
              Sign In
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  },
);

LoginView.displayName = 'LoginView';
