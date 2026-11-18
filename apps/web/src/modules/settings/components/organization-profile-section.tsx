import React from 'react';
import {
  Avatar,
  AvatarFallback,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kinergy-platform/ui';
import { Building2, ShieldCheck, Mail, Layers } from 'lucide-react';
import { useTranslation } from '../../../app/providers/locale-provider';
import { useOptionalAuth } from '../../../app/providers/auth-provider';
import { useUserProfileQuery } from '../api/settings-queries';

export interface OrganizationProfileSectionProps {
  className?: string;
}

export const OrganizationProfileSection: React.FC<OrganizationProfileSectionProps> = ({
  className = '',
}) => {
  const { locale, t } = useTranslation();
  const auth = useOptionalAuth();
  const { data: profile } = useUserProfileQuery();

  const tenantId = profile?.tenantId ?? auth?.currentUser?.tenantId ?? 'tenant-kinergy-main';
  const orgName =
    tenantId === 'tenant-kinergy-main'
      ? 'Kinergy Health & Performance HQ'
      : `Kinergy Facility (${tenantId})`;

  return (
    <Card className={`w-full ${className}`} data-testid="organization-profile-card">
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" aria-hidden="true" />
              <CardTitle>
                {locale === 'es'
                  ? t('settings.general.organization.title', 'Perfil de la organización')
                  : 'Organization profile'}
              </CardTitle>
            </div>
            <CardDescription>
              {locale === 'es'
                ? t(
                    'settings.general.organization.description',
                    'Contexto de inquilino de la sede y parámetros de la organización.',
                  )
                : 'Facility tenant context and enterprise organization parameters.'}
            </CardDescription>
          </div>

          <Badge
            variant="outline"
            className="w-fit gap-1 text-xs uppercase"
            data-testid="org-status-badge"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {locale === 'es' ? 'Activo' : 'Active'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-muted/20 p-4 sm:flex-row sm:items-center">
          <Avatar className="h-14 w-14 rounded-lg">
            <AvatarFallback className="rounded-lg font-bold text-lg bg-primary text-primary-foreground">
              KP
            </AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <h3 className="font-semibold text-foreground text-base" data-testid="org-display-name">
              {orgName}
            </h3>
            <p className="text-xs text-muted-foreground">
              {locale === 'es'
                ? 'Plataforma unificada para kinesiología, gimnasio y gestión operativa.'
                : 'Unified platform for kinesiology, gym operations, and resource management.'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border p-3.5 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Layers className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {locale === 'es'
                  ? t('settings.general.organization.identifierLabel', 'ID de sede / inquilino')
                  : 'Facility Tenant ID'}
              </span>
            </div>
            <p
              className="font-mono text-sm font-semibold text-foreground"
              data-testid="org-tenant-id"
            >
              {tenantId}
            </p>
          </div>

          <div className="rounded-lg border border-border p-3.5 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {locale === 'es'
                  ? t(
                      'settings.general.organization.contactEmailLabel',
                      'Contacto de soporte y administración',
                    )
                  : 'Support & Administration Contact'}
              </span>
            </div>
            <p className="text-sm font-semibold text-foreground" data-testid="org-contact-email">
              support@kinergy-platform.io
            </p>
          </div>

          <div className="rounded-lg border border-border p-3.5 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {locale === 'es'
                  ? t('settings.general.organization.scopeLabel', 'Alcance de despliegue')
                  : 'Deployment Scope'}
              </span>
            </div>
            <p className="text-sm font-medium text-foreground">
              {locale === 'es' ? 'Sede aislada multi-inquilino' : 'Multi-Tenant Isolated Facility'}
            </p>
          </div>

          <div className="rounded-lg border border-border p-3.5 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {locale === 'es'
                  ? t('settings.general.organization.statusLabel', 'Estado de la organización')
                  : 'Organization Status'}
              </span>
            </div>
            <p className="text-sm font-medium text-foreground">
              {locale === 'es' ? 'Aprovisionado y verificado' : 'Provisioned & Verified'}
            </p>
          </div>
        </div>

        <div className="rounded-md border border-border/80 bg-muted/40 p-3.5 text-xs text-muted-foreground leading-relaxed">
          {locale === 'es'
            ? t(
                'settings.general.organization.multiTenantNotice',
                'El perfil de la organización y los parámetros de la sede se aprovisionan a nivel de plataforma. Contacta a tu administrador de sistemas para solicitar actualizaciones.',
              )
            : 'Organization profile and facility parameters are provisioned at the platform level. Contact your system administrator to request updates.'}
        </div>
      </CardContent>
    </Card>
  );
};
