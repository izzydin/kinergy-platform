import React, { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Badge } from '@kinergy-platform/ui';
import { SuspenseFallback } from '../../../app/routes/lazy-loading';
import { SettingsNavTabs } from '../components/settings-nav-tabs';
import { useTranslation } from '../../../app/providers/locale-provider';

export const SettingsLayoutPage: React.FC = () => {
  const { locale, t } = useTranslation();

  return (
    <div className="space-y-6">
      {/* 1. Header & Title */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-3xl tracking-tight text-foreground">
              {locale === 'es'
                ? t('settings.title', 'Configuración de la plataforma')
                : 'Platform Settings'}
            </h1>
            <Badge variant="outline" className="hidden sm:inline-flex">
              Step A5.3 Validation
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            {locale === 'es'
              ? t(
                  'settings.subtitle',
                  'Administra preferencias del espacio de trabajo, idioma, seguridad de la cuenta y acceso del personal.',
                )
              : 'Architectural validation screen verifying Form Foundation, React Hook Form + Zod resolvers, PasswordInput primitives, Avatars, Dialogs, Toasts, and Theme tokens.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">React Hook Form</Badge>
          <Badge variant="secondary">Zod Validation</Badge>
          <Badge variant="secondary">Radix UI</Badge>
        </div>
      </div>

      {/* 2. Sub-Navigation Tabs */}
      <SettingsNavTabs />

      {/* 3. Nested Sub-Route Outlet */}
      <div className="pt-2">
        <Suspense fallback={<SuspenseFallback label="Loading Settings..." />}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
};
