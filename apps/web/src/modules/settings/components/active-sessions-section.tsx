import React, { useState } from 'react';
import {
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
} from '@kinergy-platform/ui';
import { Laptop, KeyRound, AlertTriangle } from 'lucide-react';
import { useTranslation } from '../../../app/providers/locale-provider';
import { useOptionalAuth } from '../../../app/providers/auth-provider';
import { useRevokeAllSessionsMutation } from '../api/settings-mutations';

export interface ActiveSessionsSectionProps {
  onRevokeSuccess?: () => void;
  onRevokeError?: (error: Error) => void;
}

export const ActiveSessionsSection: React.FC<ActiveSessionsSectionProps> = ({
  onRevokeSuccess,
  onRevokeError,
}) => {
  const { locale, t } = useTranslation();
  const auth = useOptionalAuth();
  const revokeMutation = useRevokeAllSessionsMutation();
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);

  const isEs = locale === 'es';

  const handleConfirmRevocation = async () => {
    try {
      await revokeMutation.mutateAsync();
      setIsDialogOpen(false);
      onRevokeSuccess?.();

      // If user is actively authenticated in an AuthProvider, trigger clean logout
      if (auth && typeof auth.logout === 'function') {
        // Small delay to allow the user to view the confirmation toast before transition
        setTimeout(() => {
          void auth.logout();
        }, 1200);
      }
    } catch (err) {
      setIsDialogOpen(false);
      const error = err instanceof Error ? err : new Error('Failed to revoke sessions.');
      onRevokeError?.(error);
    }
  };

  return (
    <Card className="w-full border-border bg-card shadow-sm" data-testid="active-sessions-card">
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

        {/* Global Session Revocation Block */}
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-muted/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-foreground" aria-hidden="true" />
              <h3 className="font-semibold text-foreground text-sm">
                {isEs
                  ? t('settings.security.sessions.revokeTitle', 'Revocación global de sesiones')
                  : 'Active Session Control'}
              </h3>
            </div>
            <p className="text-xs text-muted-foreground max-w-xl">
              {isEs
                ? t(
                    'settings.security.sessions.revokeDesc',
                    'Revoca todas las familias de tokens de refresco activas en navegadores secundarios y dispositivos móviles.',
                  )
                : 'Revoke all active JWT bearer sessions across secondary browsers and mobile devices.'}
            </p>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
                className="shrink-0"
                data-testid="revoke-all-sessions-btn"
              >
                {isEs ? 'Revoke All Sessions' : 'Revoke All Sessions'}
              </Button>
            </DialogTrigger>

            <DialogContent>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
                  <DialogTitle>Confirm Global Session Revocation</DialogTitle>
                </div>
                <DialogDescription className="space-y-2 pt-2">
                  <p>
                    This action will immediately invalidate all refresh tokens. Users will be
                    required to re-authenticate.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Already-issued access tokens expire within 15 minutes. To ensure immediate
                    account safety, your current session will also be terminated and you will need
                    to sign in again.
                  </p>
                </DialogDescription>
              </DialogHeader>

              <DialogFooter className="gap-2 sm:gap-0">
                <DialogClose asChild>
                  <Button variant="outline" size="sm">
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleConfirmRevocation}
                  isLoading={revokeMutation.isPending}
                  disabled={revokeMutation.isPending}
                  data-testid="confirm-revocation-btn"
                >
                  Confirm Revocation
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
};
