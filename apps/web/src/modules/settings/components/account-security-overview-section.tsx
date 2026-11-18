import React from 'react';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kinergy-platform/ui';
import { ShieldCheck, KeyRound, Clock, ShieldAlert, Lock } from 'lucide-react';
import { useTranslation } from '../../../app/providers/locale-provider';

export const AccountSecurityOverviewSection: React.FC = () => {
  const { locale, t } = useTranslation();

  const isEs = locale === 'es';

  return (
    <Card className="w-full border-border bg-card shadow-sm" data-testid="security-overview-card">
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
              <CardTitle className="text-xl">
                {isEs
                  ? t('settings.security.overview.title', 'Resumen de seguridad de la cuenta')
                  : 'Account security overview'}
              </CardTitle>
            </div>
            <CardDescription>
              {isEs
                ? t(
                    'settings.security.overview.description',
                    'Protecciones de identidad activas y políticas de seguridad de sesión de tu cuenta.',
                  )
                : 'Active identity protections and session security policies governing your account.'}
            </CardDescription>
          </div>
          <Badge variant="outline" className="w-fit border-primary/30 text-primary">
            {isEs ? 'Protección activa' : 'Active Protection'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* 1. Authentication Method */}
          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                {isEs
                  ? t('settings.security.overview.authMethod', 'Método de autenticación')
                  : 'Authentication Method'}
              </span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                Argon2id
              </Badge>
            </div>
            <p className="font-medium text-sm text-foreground">
              {isEs ? 'Identidad empresarial Argon2id' : 'Argon2id Enterprise Identity'}
            </p>
            <p className="text-xs text-muted-foreground">
              {isEs
                ? t(
                    'settings.security.overview.authMethodDesc',
                    'Identidad empresarial Argon2id con protección de memoria y cómputo',
                  )
                : 'Memory-hardened cryptographic password hashing with time-cost protection.'}
            </p>
          </div>

          {/* 2. Session Token Policy */}
          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                {isEs
                  ? t('settings.security.overview.sessionPolicy', 'Política de tokens de sesión')
                  : 'Session Token Policy'}
              </span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                15m / 7d
              </Badge>
            </div>
            <p className="font-medium text-sm text-foreground">
              {isEs ? 'Tokens rotados y de corta duración' : 'Short-Lived Access & Rotated Refresh'}
            </p>
            <p className="text-xs text-muted-foreground">
              {isEs
                ? t(
                    'settings.security.overview.sessionPolicyDesc',
                    'Tokens de acceso con expiración a 15 min y rotación de tokens de refresco a 7 días',
                  )
                : '15-minute access token lifespan with cryptographic refresh token family rotation.'}
            </p>
          </div>

          {/* 3. Password History Protection */}
          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <KeyRound className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                {isEs
                  ? t(
                      'settings.security.overview.passwordHistory',
                      'Protección de historial de contraseñas',
                    )
                  : 'Password History'}
              </span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {isEs ? '5 previas' : '5 Previous'}
              </Badge>
            </div>
            <p className="font-medium text-sm text-foreground">
              {isEs ? 'Prevención de reutilización' : 'Reuse Prevention'}
            </p>
            <p className="text-xs text-muted-foreground">
              {isEs
                ? t(
                    'settings.security.overview.passwordHistoryDesc',
                    'Las últimas 5 contraseñas no pueden reutilizarse',
                  )
                : 'The last 5 passwords cannot be reused when updating account credentials.'}
            </p>
          </div>

          {/* 4. Multi-Factor Authentication */}
          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                {isEs
                  ? t('settings.security.overview.mfa', 'Autenticación de dos factores (MFA)')
                  : 'Two-Factor Auth'}
              </span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                {isEs ? 'Hoja de ruta' : 'Roadmap'}
              </Badge>
            </div>
            <p className="font-medium text-sm text-foreground">
              {isEs ? 'No configurada' : 'Not Configured'}
            </p>
            <p className="text-xs text-muted-foreground">
              {isEs
                ? t(
                    'settings.security.overview.mfaStatus',
                    'No configurada (Hoja de ruta empresarial)',
                  )
                : 'Hardware security key and TOTP authenticator app support planned for future enterprise tier.'}
            </p>
          </div>

          {/* 5. Tenant Isolation */}
          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-1.5 sm:col-span-2 lg:col-span-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                {isEs
                  ? t('settings.security.overview.tenantIsolation', 'Aislamiento de organización')
                  : 'Tenant Isolation & RBAC'}
              </span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {isEs ? 'Aislado' : 'Enforced'}
              </Badge>
            </div>
            <p className="font-medium text-sm text-foreground">
              {isEs
                ? 'Límites estrictos de inquilino y control de acceso'
                : 'Strict Multi-Tenant Database Boundaries'}
            </p>
            <p className="text-xs text-muted-foreground">
              {isEs
                ? t(
                    'settings.security.overview.tenantIsolationDesc',
                    'Garantizado por filtros de base de datos y guardias de autorización',
                  )
                : 'All credentials, user profiles, and operational tokens are scoped strictly to your organization boundary.'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
