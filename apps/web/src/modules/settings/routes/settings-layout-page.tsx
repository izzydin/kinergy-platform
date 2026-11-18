import React, { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
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
          <h1 className="font-bold text-3xl tracking-tight text-foreground">
            {locale === 'es'
              ? t('settings.title', 'Configuración de la plataforma')
              : t('settings.title', 'Platform Settings')}
          </h1>
          <p className="text-muted-foreground text-sm">
            {locale === 'es'
              ? t(
                  'settings.subtitle',
                  'Administra preferencias del espacio de trabajo, idioma, seguridad de la cuenta y acceso del personal.',
                )
              : t(
                  'settings.subtitle',
                  'Manage workspace preferences, language, account security, and staff access.',
                )}
          </p>
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
