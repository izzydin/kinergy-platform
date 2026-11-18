import React from 'react';
import { useTranslation } from '../../../app/providers/locale-provider';
import { OrganizationProfileSection } from '../components/organization-profile-section';
import { RegionalPreferencesSection } from '../components/regional-preferences-section';
import { ApplicationPreferencesSection } from '../components/application-preferences-section';
import { OperationalStandardsSection } from '../components/operational-standards-section';
import { SettingsProfileSection } from '../components/settings-profile-section';

export const GeneralSettingsPage: React.FC = () => {
  const { locale, t } = useTranslation();

  return (
    <div className="space-y-8" data-testid="general-settings-page">
      {/* Page Header */}
      <div className="space-y-1">
        <h2 className="font-bold text-2xl tracking-tight text-foreground">
          {locale === 'es'
            ? t('settings.general.title', 'Configuración general')
            : 'General settings'}
        </h2>
        <p className="text-muted-foreground text-sm">
          {locale === 'es'
            ? t(
                'settings.general.description',
                'Administra el perfil de tu organización y las preferencias generales de la aplicación.',
              )
            : "Manage your organization's profile and general application preferences."}
        </p>
      </div>

      {/* 1. Organization Profile */}
      <OrganizationProfileSection />

      {/* 2. Regional Preferences (Language & Format Standards) */}
      <RegionalPreferencesSection />

      {/* 3. Application Preferences (Theme Mode) */}
      <ApplicationPreferencesSection />

      {/* 4. Operational Standards & Policies */}
      <OperationalStandardsSection />

      {/* 5. Authenticated Employee Profile */}
      <SettingsProfileSection />
    </div>
  );
};
