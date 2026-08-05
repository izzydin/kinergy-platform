import { moduleRegistry } from '../../app/routes/module-registry';
import { SettingsRouter } from './settings.router';

// Register Settings Module Contract with central router shell
moduleRegistry.register({
  id: 'settings',
  prefix: '/settings',
  title: 'Platform Settings',
  isProtected: true,
  component: SettingsRouter,
});

export { SettingsRouter };
export { SettingsView } from './presentation/settings-view';
