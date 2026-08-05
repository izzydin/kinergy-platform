import React, { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  FormControl,
  FormErrorMessage,
  FormField,
  FormHelperText,
  FormLabel,
  PasswordInput,
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@kinergy-platform/ui';
import { securitySettingsSchema, type SecuritySettingsFormValues } from '../types';

export const SecuritySettingsForm: React.FC = () => {
  const [simulateError, setSimulateError] = useState<boolean>(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [sessionsRevokedToast, setSessionsRevokedToast] = useState<boolean>(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<SecuritySettingsFormValues>({
    resolver: zodResolver(securitySettingsSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
      twoFactorAuth: true,
    },
  });

  const onSubmit = async (_data: SecuritySettingsFormValues) => {
    setSubmitStatus('idle');
    setToastMessage(null);

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    if (simulateError) {
      setSubmitStatus('error');
      return;
    }

    setSubmitStatus('success');
    setToastMessage('Security credential policy updated successfully.');
    reset();
  };

  const handleRevokeAllSessions = () => {
    setSessionsRevokedToast(true);
  };

  return (
    <ToastProvider>
      <Card className="w-full">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Security & Password Policy</CardTitle>
              <CardDescription>
                Validates PasswordInput primitives, Password strength Zod schemas, Dialog revocation
                modal, and Toasts.
              </CardDescription>
            </div>
            <Badge variant="secondary">Security Contract</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
            {/* 1. Status Alert */}
            {submitStatus === 'error' && (
              <Alert variant="destructive" data-testid="security-form-error">
                <AlertTitle>Password Update Failed</AlertTitle>
                <AlertDescription>
                  Current password validation failed on security server. Please verify your
                  credentials.
                </AlertDescription>
              </Alert>
            )}

            {submitStatus === 'success' && (
              <Alert variant="default" data-testid="security-form-success">
                <AlertTitle>Credentials Updated</AlertTitle>
                <AlertDescription>
                  Your security password has been updated and active tokens refreshed.
                </AlertDescription>
              </Alert>
            )}

            {/* 2. PasswordInput: Current Password */}
            <FormField isInvalid={Boolean(errors.currentPassword)}>
              <FormLabel required>Current Password</FormLabel>
              <FormControl>
                <PasswordInput
                  {...register('currentPassword')}
                  placeholder="••••••••••••"
                  data-testid="current-password-input"
                />
              </FormControl>
              <FormHelperText>
                Enter your existing account password to confirm identity.
              </FormHelperText>
              <FormErrorMessage>{errors.currentPassword?.message}</FormErrorMessage>
            </FormField>

            {/* 3. PasswordInput: New Password */}
            <FormField isInvalid={Boolean(errors.newPassword)}>
              <FormLabel required>New Security Password</FormLabel>
              <FormControl>
                <PasswordInput
                  {...register('newPassword')}
                  placeholder="••••••••••••"
                  data-testid="new-password-input"
                />
              </FormControl>
              <FormHelperText>
                Must contain at least 8 characters, 1 uppercase letter, and 1 numeric digit.
              </FormHelperText>
              <FormErrorMessage>{errors.newPassword?.message}</FormErrorMessage>
            </FormField>

            {/* 4. PasswordInput: Confirm Password */}
            <FormField isInvalid={Boolean(errors.confirmPassword)}>
              <FormLabel required>Confirm New Password</FormLabel>
              <FormControl>
                <PasswordInput
                  {...register('confirmPassword')}
                  placeholder="••••••••••••"
                  data-testid="confirm-password-input"
                />
              </FormControl>
              <FormHelperText>Re-enter your new password to verify accuracy.</FormHelperText>
              <FormErrorMessage>{errors.confirmPassword?.message}</FormErrorMessage>
            </FormField>

            {/* 5. Session Revocation Modal Trigger */}
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-4">
              <div>
                <h4 className="font-semibold text-foreground text-sm">Active Session Control</h4>
                <p className="text-xs text-muted-foreground">
                  Revoke all active JWT bearer sessions across secondary browsers and mobile
                  devices.
                </p>
              </div>

              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    Revoke All Sessions
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Confirm Global Session Revocation</DialogTitle>
                    <DialogDescription>
                      This action will immediately invalidate all refresh tokens. Users will be
                      required to re-authenticate.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter className="gap-2">
                    <DialogClose asChild>
                      <Button variant="outline" size="sm">
                        Cancel
                      </Button>
                    </DialogClose>
                    <DialogClose asChild>
                      <Button variant="destructive" size="sm" onClick={handleRevokeAllSessions}>
                        Confirm Revocation
                      </Button>
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {/* 6. Action Bar & Error Simulation */}
            <div className="flex flex-col gap-3 rounded-lg border border-border p-4 bg-background sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={simulateError}
                  onChange={(e) => setSimulateError(e.target.checked)}
                  className="rounded border-border"
                />
                <span>Simulate Invalid Credential Server Error</span>
              </label>

              <Button
                type="submit"
                variant="default"
                size="sm"
                isLoading={isSubmitting}
                loadingText="Updating Password..."
              >
                Update Password Policy
              </Button>
            </div>
          </form>
        </CardContent>
        <CardFooter className="text-xs text-muted-foreground">
          Password Input Spec: Includes WAI-ARIA accessible show/hide toggle and validation error
          visual bindings.
        </CardFooter>
      </Card>

      {/* Toast Notification Viewport */}
      <ToastViewport>
        {toastMessage && (
          <Toast variant="default">
            <div className="grid gap-1">
              <ToastTitle>Security Notice</ToastTitle>
              <ToastDescription>{toastMessage}</ToastDescription>
            </div>
            <ToastClose onClick={() => setToastMessage(null)} />
          </Toast>
        )}
        {sessionsRevokedToast && (
          <Toast variant="destructive">
            <div className="grid gap-1">
              <ToastTitle>Sessions Revoked</ToastTitle>
              <ToastDescription>
                All active platform refresh tokens have been revoked.
              </ToastDescription>
            </div>
            <ToastClose onClick={() => setSessionsRevokedToast(false)} />
          </Toast>
        )}
      </ToastViewport>
    </ToastProvider>
  );
};
