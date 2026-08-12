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
    const { form, errors, isSubmitting, authError, handleSubmit } = useLoginForm();

    const onSubmitForm = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      await handleSubmit(e);
      if (onSuccess && !authError && !Object.keys(errors).length) {
        onSuccess();
      }
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
          {authError && (
            <Alert variant="destructive" className="mb-6" role="alert" aria-live="assertive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <AlertTitle>Authentication Failed</AlertTitle>
              <AlertDescription>{authError}</AlertDescription>
            </Alert>
          )}

          <form
            onSubmit={onSubmitForm}
            noValidate
            aria-label="Sign in to your Kinergy account"
            className="space-y-4"
          >
            <FormField controlId="login-email" isInvalid={Boolean(errors.email)}>
              <FormLabel required>Email Address</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="name@company.com"
                  autoComplete="username"
                  disabled={isSubmitting}
                  {...form.register('email')}
                />
              </FormControl>
              <FormErrorMessage>{errors.email?.message}</FormErrorMessage>
            </FormField>

            <FormField controlId="login-password" isInvalid={Boolean(errors.password)}>
              <FormLabel required>Password</FormLabel>
              <FormControl>
                <PasswordInput
                  placeholder="••••••••"
                  autoComplete="current-password"
                  disabled={isSubmitting}
                  {...form.register('password')}
                />
              </FormControl>
              <FormErrorMessage>{errors.password?.message}</FormErrorMessage>
            </FormField>

            <Button
              type="submit"
              disabled={isSubmitting}
              isLoading={isSubmitting}
              loadingText="Signing in..."
              className="mt-6 w-full shadow-md transition-all duration-150 active:scale-[0.99]"
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
