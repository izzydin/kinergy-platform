import React from 'react';
import { SettingsProfileSection } from '../components/settings-profile-section';
import { GeneralSettingsForm } from '../components/general-settings-form';
import { LanguageSelector } from '../../../shared/i18n/language-selector';

export const GeneralSettingsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <LanguageSelector variant="card" />
      <SettingsProfileSection />
      <GeneralSettingsForm />
    </div>
  );
};
