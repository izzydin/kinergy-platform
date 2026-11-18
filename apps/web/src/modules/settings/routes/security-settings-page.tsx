import React from 'react';
import { useTranslation } from '../../../app/providers/locale-provider';
import { SecuritySettingsForm } from '../components/security-settings-form';
import { AccountSecurityOverviewSection } from '../components/account-security-overview-section';
import { SecurityActivitySection } from '../components/security-activity-section';

export const SecuritySettingsPage: React.FC = () => {
  const { locale, t } = useTranslation();

  const isEs = locale === 'es';

  return (
    <div className="space-y-8" data-testid="security-settings-page">
      {/* Page Header */}
      <div className="space-y-1">
        <h2 className="font-bold text-2xl tracking-tight text-foreground">
          {isEs ? t('settings.security.title', 'Seguridad') : 'Security'}
        </h2>
        <p className="text-muted-foreground text-sm">
          {isEs
            ? t(
                'settings.security.subtitle',
                'Administra tu contraseña, sesiones activas y seguridad de la cuenta.',
              )
            : 'Manage your password, active sessions, and account security.'}
        </p>
      </div>

      {/* 1. Account Security Protections Overview */}
      <AccountSecurityOverviewSection />

      {/* 2. Password Management & Active Session Controls */}
      <SecuritySettingsForm />

      {/* 3. Security Activity & Platform Audit Notice */}
      <SecurityActivitySection />
    </div>
  );
};
