import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { moduleRegistry } from '../../app/routes/module-registry';
import { SlotProvider } from '../../shared/ui/slots/SlotProvider';
import { SlotTarget } from '../../shared/ui/slots/SlotTarget';
import { DashboardOverviewPage, DashboardRouter } from '../dashboard';
import { SettingsLayoutPage, SettingsRouter } from '../settings';

describe('Milestone A5.1 — Validation Module Architecture', () => {
  describe('1. Module Route Registration', () => {
    it('registers dashboard and settings modules with central moduleRegistry', () => {
      const registered = moduleRegistry.getRegisteredModules();
      const dashboardModule = registered.find((m) => m.id === 'dashboard');
      const settingsModule = registered.find((m) => m.id === 'settings');

      expect(dashboardModule).toBeDefined();
      expect(dashboardModule?.prefix).toBe('/dashboard');
      expect(dashboardModule?.isProtected).toBe(true);

      expect(settingsModule).toBeDefined();
      expect(settingsModule?.prefix).toBe('/settings');
      expect(settingsModule?.isProtected).toBe(true);
    });
  });

  describe('2. Dashboard Validation Feature Module', () => {
    it('renders DashboardOverviewPage with layout slot injections', () => {
      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <SlotProvider>
            <div>
              <div data-testid="header-target">
                <SlotTarget name="header-actions" />
              </div>
              <DashboardOverviewPage />
            </div>
          </SlotProvider>
        </MemoryRouter>,
      );

      expect(screen.getByRole('heading', { name: /dashboard overview/i })).toBeInTheDocument();
      expect(screen.getByText('Active Energy Monitors')).toBeInTheDocument();
      expect(screen.getByText('Quick System Check')).toBeInTheDocument();
    });

    it('renders DashboardRouter sub-routes correctly', () => {
      render(
        <MemoryRouter initialEntries={['/metrics']}>
          <SlotProvider>
            <DashboardRouter />
          </SlotProvider>
        </MemoryRouter>,
      );

      expect(screen.getByRole('heading', { name: /metrics & performance/i })).toBeInTheDocument();
      expect(screen.getByText('Telemetry Throughput')).toBeInTheDocument();
    });
  });

  describe('3. Settings Validation Feature Module', () => {
    it('renders SettingsLayoutPage with navigation tab controls', () => {
      render(
        <MemoryRouter initialEntries={['/settings/general']}>
          <SettingsLayoutPage />
        </MemoryRouter>,
      );

      expect(screen.getByRole('heading', { name: /platform settings/i })).toBeInTheDocument();
      expect(screen.getByText('General Preferences')).toBeInTheDocument();
      expect(screen.getByText('Security Controls')).toBeInTheDocument();
    });

    it('renders SettingsRouter sub-routes and general settings form', () => {
      render(
        <MemoryRouter initialEntries={['/general']}>
          <SettingsRouter />
        </MemoryRouter>,
      );

      expect(screen.getByText('General Workspace Settings')).toBeInTheDocument();
      expect(screen.getByLabelText(/workspace name/i)).toBeInTheDocument();
    });

    it('renders security settings sub-route (/security)', () => {
      render(
        <MemoryRouter initialEntries={['/security']}>
          <SettingsRouter />
        </MemoryRouter>,
      );

      expect(screen.getByText('Security Policy Active')).toBeInTheDocument();
      expect(screen.getByText('Update Security Keys')).toBeInTheDocument();
    });
  });
});
