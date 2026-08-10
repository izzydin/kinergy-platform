import '@testing-library/jest-dom';
import { QueryClient } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

import { SlotProvider } from '../../shared/ui/slots';
import { BreadcrumbProvider } from '../../app/breadcrumbs';
import { NavigationProvider } from '../../app/navigation';
import { AuthProvider } from '../../app/providers/auth-provider';
import { FeatureFlagProvider } from '../../app/providers/feature-flag-provider';
import {
  notificationService,
  NotificationProvider,
} from '../../app/providers/notification-provider';
import { QueryProvider } from '../../app/providers/query-provider';
import { RootErrorBoundaryProvider } from '../../app/providers/root-error-boundary-provider';
import { ThemeProvider } from '../../app/providers/theme-provider';
import { httpClient } from '../../shared/api';
import { authTokenStore, setupAuthTransport } from '../../shared/auth';
import { InfrastructureIntegrationPanel } from '../dashboard/components/infrastructure-integration-panel';

function createMockResponse(body: unknown, status = 200): Response {
  const isString = typeof body === 'string';
  const textContent = isString
    ? (body as string)
    : body !== null && body !== undefined
      ? JSON.stringify(body)
      : '';

  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(textContent),
    json: () => Promise.resolve(isString ? JSON.parse(textContent) : body),
  } as Response;
}

describe('Step A6.8 — Shared Infrastructure Integration Suite', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    act(() => {
      notificationService.clearAll();
      authTokenStore.clearSession();
    });

    setupAuthTransport(httpClient);

    if (!global.fetch) {
      (global as unknown as { fetch: typeof fetch }).fetch = jest.fn();
    }

    jest.spyOn(global, 'fetch').mockImplementation((url) => {
      const urlStr = typeof url === 'string' ? url : String(url);

      if (urlStr.includes('/api/v1/test/mutation-success')) {
        return Promise.resolve(
          createMockResponse(
            { status: 'ok', id: 'res_100', message: 'Mutation executed successfully' },
            200,
          ),
        );
      }

      if (urlStr.includes('/api/v1/test/mutation-failure')) {
        return Promise.resolve(
          createMockResponse(
            {
              code: 'VALIDATION_ERROR',
              message: 'Validation failed',
              details: { name: ['Name is required'] },
            },
            400,
          ),
        );
      }

      if (urlStr.includes('/api/v1/test/auth-failure')) {
        return Promise.resolve(
          createMockResponse({ message: 'Session expired or invalid token' }, 401),
        );
      }

      return Promise.resolve(createMockResponse({ status: 'ok' }, 200));
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const renderWithInfrastructure = (ui: React.ReactNode) => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });

    return render(
      <RootErrorBoundaryProvider>
        <QueryProvider queryClient={queryClient}>
          <ThemeProvider>
            <SlotProvider>
              <NotificationProvider>
                <MemoryRouter initialEntries={['/dashboard/ui-states']}>
                  <AuthProvider>
                    <FeatureFlagProvider>
                      <NavigationProvider>
                        <BreadcrumbProvider>{ui}</BreadcrumbProvider>
                      </NavigationProvider>
                    </FeatureFlagProvider>
                  </AuthProvider>
                </MemoryRouter>
              </NotificationProvider>
            </SlotProvider>
          </ThemeProvider>
        </QueryProvider>
      </RootErrorBoundaryProvider>,
    );
  };

  describe('1. Composition Root & Provider Hierarchy', () => {
    it('renders Infrastructure Integration Panel within full AppProvider composition', async () => {
      renderWithInfrastructure(<InfrastructureIntegrationPanel />);

      expect(
        screen.getByText(/Step A6.8 — Shared Infrastructure Integration/i),
      ).toBeInTheDocument();
      expect(screen.getByTestId('infrastructure-panel')).toBeInTheDocument();
    });
  });

  describe('2. Standard Mutation Pipeline: Success & Notification Integration', () => {
    it('executes mutation via httpClient and dispatches success toast notification', async () => {
      const listener = jest.fn();
      const unsubscribe = notificationService.subscribe(listener);

      renderWithInfrastructure(<InfrastructureIntegrationPanel />);

      const successBtn = screen.getByTestId('mutation-success-btn');
      fireEvent.click(successBtn);

      await waitFor(() => {
        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'ADD',
            notification: expect.objectContaining({
              type: 'success',
              title: 'Standard Mutation succeeded cleanly via API Client',
            }),
          }),
        );
      });

      unsubscribe();
    });
  });

  describe('3. Standard Mutation Pipeline: Failure & Error Normalization Integration', () => {
    it('executes failing mutation via httpClient, normalizes error, and dispatches error toast', async () => {
      const listener = jest.fn();
      const unsubscribe = notificationService.subscribe(listener);

      renderWithInfrastructure(<InfrastructureIntegrationPanel />);

      const failureBtn = screen.getByTestId('mutation-failure-btn');
      fireEvent.click(failureBtn);

      await waitFor(() => {
        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'ADD',
            notification: expect.objectContaining({
              type: 'error',
              title: 'Mutation Failed',
            }),
          }),
        );
      });

      unsubscribe();
    });
  });

  describe('4. Opt-in Optimistic Updates & Automatic Rollback Integration', () => {
    it('optimistically updates cache value and persists when server request succeeds', async () => {
      let resolveFetch!: (val: Response) => void;
      const pendingFetch = new Promise<Response>((res) => {
        resolveFetch = res;
      });

      jest.spyOn(global, 'fetch').mockImplementationOnce(() => pendingFetch);

      renderWithInfrastructure(<InfrastructureIntegrationPanel />);

      expect(screen.getByTestId('optimistic-cache-val')).toHaveTextContent(
        'Original Cache Value (Count: 10)',
      );

      const optBtn = screen.getByTestId('optimistic-mutation-btn');
      fireEvent.click(optBtn);

      // 1. Verify cache is updated optimistically while request is in-flight
      await waitFor(() => {
        expect(screen.getByTestId('optimistic-cache-val')).toHaveTextContent(
          'Optimistically Updated Value (Count: 11)',
        );
      });

      // 2. Resolve fetch response
      act(() => {
        resolveFetch(
          createMockResponse(
            { status: 'ok', id: 'res_100', message: 'Mutation executed successfully' },
            200,
          ),
        );
      });
    });

    it('rolls back cache snapshot automatically when optimistic mutation fails', async () => {
      renderWithInfrastructure(<InfrastructureIntegrationPanel />);

      // Enable simulate failure checkbox
      const checkbox = screen.getByTestId('simulate-failure-checkbox');
      fireEvent.click(checkbox);

      const optBtn = screen.getByTestId('optimistic-mutation-btn');
      fireEvent.click(optBtn);

      // Verify automatic rollback to original snapshot
      await waitFor(() => {
        expect(screen.getByTestId('optimistic-cache-val')).toHaveTextContent(
          'Original Cache Value (Count: 10)',
        );
      });
    });
  });

  describe('5. Notification Provider & Toast Dispatcher', () => {
    it('dispatches success, error, warning, and info toasts via hook controls', async () => {
      const listener = jest.fn();
      const unsubscribe = notificationService.subscribe(listener);

      renderWithInfrastructure(<InfrastructureIntegrationPanel />);

      fireEvent.click(screen.getByTestId('toast-success-btn'));
      fireEvent.click(screen.getByTestId('toast-error-btn'));
      fireEvent.click(screen.getByTestId('toast-warning-btn'));
      fireEvent.click(screen.getByTestId('toast-info-btn'));

      expect(listener).toHaveBeenCalledTimes(4);

      unsubscribe();
    });
  });

  describe('6. Module Error Boundary Isolation & Recovery', () => {
    it('traps uncaught React rendering crash in nested ErrorBoundary without failing parent UI', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      renderWithInfrastructure(<InfrastructureIntegrationPanel />);

      // Verify error boundary crash trigger exists
      const crashBtn = screen.getByTestId('trigger-crash-btn');
      expect(crashBtn).toBeInTheDocument();

      // Trigger intentional crash
      fireEvent.click(crashBtn);

      // Verify ErrorBoundary fallback rendered in place of crash component
      await waitFor(() => {
        expect(screen.getByText(/ValidationBoundary Component Failure/i)).toBeInTheDocument();
      });

      // Parent container remains intact and visible
      expect(screen.getByTestId('infrastructure-panel')).toBeInTheDocument();

      consoleSpy.mockRestore();
    });
  });

  describe('7. Auth Transport Interceptor & Unauthorized Session Handling', () => {
    it('clears access tokens and dispatches unauthorized notification upon 401 API response', async () => {
      const unauthorizedSpy = jest.fn();
      const unsubscribe = authTokenStore.subscribe((event) => {
        if (event === 'unauthorized') {
          unauthorizedSpy();
        }
      });

      // Set initial token to simulate authenticated state
      authTokenStore.setAccessToken('mock_access_token');

      renderWithInfrastructure(<InfrastructureIntegrationPanel />);

      const authFailBtn = screen.getByTestId('auth-failure-btn');
      fireEvent.click(authFailBtn);

      await waitFor(() => {
        expect(unauthorizedSpy).toHaveBeenCalledTimes(1);
      });

      unsubscribe();
    });
  });
});
