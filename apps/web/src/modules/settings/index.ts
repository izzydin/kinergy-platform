import { moduleRegistry } from '../../app/routes/module-registry';
import { SettingsRouter } from './routes/settings.router';

// Register Settings Feature Module Contract with central router shell
moduleRegistry.register({
  id: 'settings',
  prefix: '/settings',
  title: 'Platform Settings',
  isProtected: true,
  component: SettingsRouter,
});

export { SettingsRouter };
export { SettingsLayoutPage } from './routes/settings-layout-page';
export { SettingsProfileSection } from './components/settings-profile-section';
export type { GeneralSettingsFormValues, SecuritySettingsFormValues } from './types';
