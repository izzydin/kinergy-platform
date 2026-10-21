import React from 'react';
import { SettingsProfileSection } from '../components/settings-profile-section';
import { GeneralSettingsForm } from '../components/general-settings-form';

export const GeneralSettingsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <SettingsProfileSection />
      <GeneralSettingsForm />
    </div>
  );
};
