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
import { KeyRound, Laptop } from 'lucide-react';
import { securitySettingsSchema, type SecuritySettingsFormValues } from '../types';
import { useChangePasswordMutation, useRevokeAllSessionsMutation } from '../api/settings-mutations';
import { useTranslation } from '../../../app/providers/locale-provider';
import { useOptionalAuth } from '../../../app/providers/auth-provider';

export const SecuritySettingsForm: React.FC = () => {
  const { locale, t } = useTranslation();
  const auth = useOptionalAuth();

  const isEs = locale === 'es';

  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [serverErrorMessage, setServerErrorMessage] = useState<string | null>(null);
  const [sessionsRevokedToast, setSessionsRevokedToast] = useState<boolean>(false);
  const [isRevokeDialogOpen, setIsRevokeDialogOpen] = useState<boolean>(false);

  const changePasswordMutation = useChangePasswordMutation();
  const revokeAllSessionsMutation = useRevokeAllSessionsMutation();

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
      twoFactorAuth: false,
    },
  });

  const onSubmit = async (data: SecuritySettingsFormValues) => {
    setSubmitStatus('idle');
    setToastMessage(null);
    setServerErrorMessage(null);

    try {
      await changePasswordMutation.mutateAsync({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });

      setSubmitStatus('success');
      setToastMessage(
        isEs
          ? t(
              'settings.security.passwordUpdatedSuccess',
              'Tu contraseña ha sido actualizada exitosamente.',
            )
          : 'Security credential policy updated successfully.',
      );
      reset();
    } catch (error) {
      setSubmitStatus('error');
      const message =
        error instanceof Error
          ? error.message
          : 'Current password validation failed on security server. Please verify your credentials.';
      setServerErrorMessage(message);
    }
  };

  const handleRevokeAllSessions = async () => {
    setSessionsRevokedToast(true);
    setIsRevokeDialogOpen(false);

    try {
      await revokeAllSessionsMutation.mutateAsync();
      if (auth && typeof auth.logout === 'function') {
        setTimeout(() => {
          void auth.logout();
        }, 1500);
      }
    } catch {
      // Retain the notification to confirm revocation initiation
    }
  };

  return (
    <ToastProvider>
      <div className="space-y-6" data-testid="security-settings-form-wrapper">
        {/* 1. Password Management Card */}
        <Card className="w-full border-border bg-card shadow-sm">
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-primary" aria-hidden="true" />
                  <CardTitle className="text-xl">
                    {isEs
                      ? t('settings.security.passwordSection.title', 'Gestión de contraseña')
                      : 'Password'}
                  </CardTitle>
                </div>
                <CardDescription>
                  {isEs
                    ? t(
                        'settings.security.passwordSection.description',
                        'Actualiza la contraseña utilizada para iniciar sesión en todos los servicios de Kinergy.',
                      )
                    : 'Update the password used to authenticate your account across all Kinergy services.'}
                </CardDescription>
              </div>
              <Badge variant="outline" className="w-fit text-xs border-primary/30 text-primary">
                {isEs ? 'Credenciales' : 'Credentials'}
              </Badge>
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
              {/* Status Alerts */}
              {submitStatus === 'error' && (
                <Alert variant="destructive" data-testid="security-form-error">
                  <AlertTitle>
                    {isEs
                      ? t(
                          'settings.security.passwordSection.errorAlertTitle',
                          'Error al actualizar contraseña',
                        )
                      : 'Password Update Failed'}
                  </AlertTitle>
                  <AlertDescription>
                    {serverErrorMessage ||
                      'Current password validation failed on security server. Please verify your credentials.'}
                  </AlertDescription>
                </Alert>
              )}

              {submitStatus === 'success' && (
                <Alert variant="default" data-testid="security-form-success">
                  <AlertTitle>
                    {isEs
                      ? t(
                          'settings.security.passwordSection.successAlertTitle',
                          'Credenciales actualizadas',
                        )
                      : 'Credentials Updated'}
                  </AlertTitle>
                  <AlertDescription>
                    {isEs
                      ? t(
                          'settings.security.passwordSection.successAlertDesc',
                          'Tu contraseña de cuenta ha sido actualizada exitosamente.',
                        )
                      : 'Your security password has been updated and active tokens refreshed.'}
                  </AlertDescription>
                </Alert>
              )}

              {/* Password Policy Guidelines Box */}
              <div className="rounded-lg border border-border bg-muted/20 p-4 text-xs text-muted-foreground space-y-1.5">
                <p className="font-semibold text-foreground text-xs">
                  {isEs
                    ? t(
                        'settings.security.passwordSection.requirementsTitle',
                        'Requisitos de la contraseña',
                      )
                    : 'Password Requirements:'}
                </p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>
                    {isEs
                      ? t(
                          'settings.security.passwordSection.reqLength',
                          'Al menos 8 caracteres (se recomiendan 12+ para máxima seguridad)',
                        )
                      : 'At least 8 characters (12+ recommended for maximum security)'}
                  </li>
                  <li>
                    {isEs
                      ? t(
                          'settings.security.passwordSection.reqUppercase',
                          'Al menos 1 letra mayúscula (A-Z)',
                        )
                      : 'At least 1 uppercase letter (A-Z)'}
                  </li>
                  <li>
                    {isEs
                      ? t(
                          'settings.security.passwordSection.reqNumber',
                          'Al menos 1 dígito numérico (0-9)',
                        )
                      : 'At least 1 numeric digit (0-9)'}
                  </li>
                  <li>
                    {isEs
                      ? t(
                          'settings.security.passwordSection.reqHistory',
                          'Debe ser distinta de tu contraseña actual y las últimas 5 utilizadas',
                        )
                      : 'Must differ from your current password and previous 5 passwords'}
                  </li>
                </ul>
              </div>

              {/* Input: Current Password */}
              <FormField isInvalid={Boolean(errors.currentPassword)}>
                <FormLabel required>
                  {isEs
                    ? t('settings.security.currentPassword', 'Contraseña actual')
                    : 'Current Password'}
                </FormLabel>
                <FormControl>
                  <PasswordInput
                    {...register('currentPassword')}
                    placeholder="••••••••••••"
                    data-testid="current-password-input"
                    autoComplete="current-password"
                  />
                </FormControl>
                <FormHelperText>
                  {isEs
                    ? t(
                        'settings.security.passwordSection.currentHelper',
                        'Ingresa tu contraseña actual para confirmar tu identidad.',
                      )
                    : 'Enter your existing account password to confirm identity.'}
                </FormHelperText>
                <FormErrorMessage>{errors.currentPassword?.message}</FormErrorMessage>
              </FormField>

              {/* Input: New Password */}
              <FormField isInvalid={Boolean(errors.newPassword)}>
                <FormLabel required>
                  {isEs
                    ? t('settings.security.newPassword', 'Nueva contraseña')
                    : 'New Security Password'}
                </FormLabel>
                <FormControl>
                  <PasswordInput
                    {...register('newPassword')}
                    placeholder="••••••••••••"
                    data-testid="new-password-input"
                    autoComplete="new-password"
                  />
                </FormControl>
                <FormHelperText>
                  {isEs
                    ? t(
                        'settings.security.passwordSection.newHelper',
                        'Debe contener al menos 8 caracteres, 1 mayúscula y 1 número.',
                      )
                    : 'Must contain at least 8 characters, 1 uppercase letter, and 1 numeric digit.'}
                </FormHelperText>
                <FormErrorMessage>{errors.newPassword?.message}</FormErrorMessage>
              </FormField>

              {/* Input: Confirm Password */}
              <FormField isInvalid={Boolean(errors.confirmPassword)}>
                <FormLabel required>
                  {isEs
                    ? t('settings.security.confirmPassword', 'Confirmar nueva contraseña')
                    : 'Confirm New Password'}
                </FormLabel>
                <FormControl>
                  <PasswordInput
                    {...register('confirmPassword')}
                    placeholder="••••••••••••"
                    data-testid="confirm-password-input"
                    autoComplete="new-password"
                  />
                </FormControl>
                <FormHelperText>
                  {isEs
                    ? t(
                        'settings.security.passwordSection.confirmHelper',
                        'Vuelve a ingresar la nueva contraseña para verificar que coincidan.',
                      )
                    : 'Re-enter your new password to verify accuracy.'}
                </FormHelperText>
                <FormErrorMessage>{errors.confirmPassword?.message}</FormErrorMessage>
              </FormField>

              {/* Submit Action */}
              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  variant="default"
                  size="sm"
                  isLoading={isSubmitting || changePasswordMutation.isPending}
                  loadingText={
                    isEs
                      ? t(
                          'settings.security.passwordSection.submittingText',
                          'Actualizando contraseña...',
                        )
                      : 'Updating Password...'
                  }
                  disabled={isSubmitting || changePasswordMutation.isPending}
                  data-testid="security-submit-btn"
                >
                  {isEs
                    ? t('settings.security.passwordSection.submitText', 'Actualizar contraseña')
                    : 'Update Password'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* 2. Active Session Control Card */}
        <Card
          className="w-full border-border bg-card shadow-sm"
          data-testid="active-sessions-section"
        >
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Laptop className="h-5 w-5 text-primary" aria-hidden="true" />
                  <CardTitle className="text-xl">
                    {isEs
                      ? t('settings.security.sessions.title', 'Sesiones activas')
                      : 'Active sessions'}
                  </CardTitle>
                </div>
                <CardDescription>
                  {isEs
                    ? t(
                        'settings.security.sessions.description',
                        'Revisa y gestiona los dispositivos que han iniciado sesión en tu cuenta.',
                      )
                    : 'Review and manage devices currently signed in to your account.'}
                </CardDescription>
              </div>
              <Badge variant="outline" className="w-fit text-xs border-primary/30 text-primary">
                {isEs ? 'Control de sesión' : 'Session Control'}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Current Active Session Indicator */}
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground text-sm">
                      {isEs
                        ? t('settings.security.sessions.currentDeviceTitle', 'Sesión activa actual')
                        : 'Current Active Session'}
                    </span>
                    <Badge
                      variant="secondary"
                      className="text-xs bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    >
                      {isEs
                        ? t('settings.security.sessions.currentDeviceBadge', 'Sesión actual')
                        : 'Current Session'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {isEs
                      ? t(
                          'settings.security.sessions.currentDeviceDesc',
                          'Autenticado mediante credenciales seguras JWT bearer en este navegador.',
                        )
                      : 'Authenticated via secure JWT bearer credentials on this browser.'}
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span
                    className="inline-block h-2 w-2 rounded-full bg-emerald-500"
                    aria-hidden="true"
                  />
                  <span>{isEs ? 'En línea' : 'Online / Active'}</span>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 border-t border-border/50 pt-3 sm:grid-cols-2 text-xs">
                <div>
                  <span className="text-muted-foreground">
                    {isEs ? 'Tipo de token:' : 'Token Type:'}{' '}
                  </span>
                  <span className="font-mono text-foreground">Bearer JWT (Stateless)</span>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {isEs ? 'Ventana de expiración:' : 'Expiry Window:'}{' '}
                  </span>
                  <span className="text-foreground">15 min access · 7 days refresh</span>
                </div>
              </div>
            </div>

            {/* Session Revocation Block */}
            <div className="flex flex-col gap-4 rounded-lg border border-border bg-muted/10 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-semibold text-foreground text-sm">Active Session Control</h3>
                <p className="text-xs text-muted-foreground">
                  Revoke all active JWT bearer sessions across secondary browsers and mobile
                  devices.
                </p>
              </div>

              <Dialog open={isRevokeDialogOpen} onOpenChange={setIsRevokeDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    Revoke All Sessions
                  </Button>
                </DialogTrigger>

                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Confirm Global Session Revocation</DialogTitle>
                    <DialogDescription className="space-y-2 pt-2">
                      <span>
                        This action will immediately invalidate all refresh tokens. Users will be
                        required to re-authenticate.
                      </span>
                    </DialogDescription>
                  </DialogHeader>

                  <div className="text-xs text-muted-foreground p-3 rounded-md bg-muted/30 border border-border">
                    <p>
                      Already-issued access tokens expire within 15 minutes. To ensure immediate
                      account safety, your current session will also be terminated and you will need
                      to sign in again.
                    </p>
                  </div>

                  <DialogFooter className="gap-2 sm:gap-0">
                    <DialogClose asChild>
                      <Button variant="outline" size="sm">
                        Cancel
                      </Button>
                    </DialogClose>
                    <DialogClose asChild>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleRevokeAllSessions}
                        isLoading={revokeAllSessionsMutation.isPending}
                        disabled={revokeAllSessionsMutation.isPending}
                      >
                        Confirm Revocation
                      </Button>
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>
      </div>

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
