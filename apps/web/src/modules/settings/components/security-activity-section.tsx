import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kinergy-platform/ui';
import { Activity, Info } from 'lucide-react';
import { useTranslation } from '../../../app/providers/locale-provider';

export const SecurityActivitySection: React.FC = () => {
  const { locale, t } = useTranslation();

  const isEs = locale === 'es';

  return (
    <Card className="w-full border-border bg-card shadow-sm" data-testid="security-activity-card">
      <CardHeader>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" aria-hidden="true" />
            <CardTitle className="text-xl">
              {isEs
                ? t('settings.security.activity.title', 'Actividad de seguridad reciente')
                : 'Recent security activity'}
            </CardTitle>
          </div>
          <CardDescription>
            {isEs
              ? t(
                  'settings.security.activity.description',
                  'Registro de auditoría y seguimiento de eventos de seguridad de la cuenta.',
                )
              : 'Audit logging and account security event tracking.'}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-foreground">
          <Info className="h-5 w-5 shrink-0 text-primary mt-0.5" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-semibold text-foreground">
              {isEs
                ? t(
                    'settings.security.activity.noticeTitle',
                    'Registro de auditoría de la plataforma',
                  )
                : 'Authoritative Platform Audit Logging'}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {isEs
                ? t(
                    'settings.security.activity.noticeDesc',
                    'Los eventos de seguridad (inicios de sesión, cambios de contraseña y revocaciones de sesión) se registran en el servicio de auditoría interno. La visualización en tiempo real se implementará en una versión futura. Si sospechas accesos no autorizados, revoca todas las sesiones inmediatamente.',
                  )
                : 'Security events (authentication attempts, password updates, and session revocations) are recorded by the internal platform audit service. Real-time self-service activity streaming is planned for an upcoming platform release. If you suspect unauthorized access, use the session revocation control above to terminate all active sessions immediately.'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
