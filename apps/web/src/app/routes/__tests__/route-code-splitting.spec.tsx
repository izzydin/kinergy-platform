/**
 * Route code-splitting behavior tests (jsdom).
 *
 * These verify React-level lazy behavior only (fallback, resolution, retry, error boundary).
 * They do NOT prove real production chunk separation; that is verified from the Vite build output.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';

import { LazyView, lazyWithRetry } from '../lazy-loading';
import { RequirePermission } from '../permission-guard';
import { ErrorBoundary } from '../../../shared/ui/error-boundary';
import { renderWithProviders } from '../../../test/test-utils';

const Hello: React.FC = () => <div>lazy-hello</div>;

describe('Route code-splitting behavior', () => {
  it('shows the loading fallback, then renders the lazy component', async () => {
    let resolveImport!: (m: { default: React.FC }) => void;
    const Lazy = lazyWithRetry(
      () =>
        new Promise<{ default: React.FC }>((res) => {
          resolveImport = res;
        }),
    );

    render(
      <LazyView fallbackLabel="Loading Test...">
        <Lazy />
      </LazyView>,
    );

    expect(screen.getByRole('status', { name: 'Loading Test...' })).toBeInTheDocument();
    resolveImport({ default: Hello });
    expect(await screen.findByText('lazy-hello')).toBeInTheDocument();
  });

  it('retries a failed dynamic import once before failing', async () => {
    const importFn = jest
      .fn<Promise<{ default: React.FC }>, []>()
      .mockRejectedValueOnce(new Error('ChunkLoadError'))
      .mockResolvedValueOnce({ default: Hello });
    const Lazy = lazyWithRetry(importFn);

    render(
      <LazyView>
        <Lazy />
      </LazyView>,
    );

    expect(await screen.findByText('lazy-hello', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(importFn).toHaveBeenCalledTimes(2);
  });

  it('surfaces a persistent chunk failure in the existing ErrorBoundary with retry', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const Lazy = lazyWithRetry(() => Promise.reject(new Error('ChunkLoadError')));

    render(
      <ErrorBoundary name="Lazy Module">
        <LazyView>
          <Lazy />
        </LazyView>
      </ErrorBoundary>,
    );

    expect(
      await screen.findByText(/Lazy Module Component Failure/i, {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry component/i })).toBeInTheDocument();
    spy.mockRestore();
  });

  it('keeps permission guards in front of lazy routes', async () => {
    const Lazy = lazyWithRetry(() => Promise.resolve({ default: Hello }));

    renderWithProviders(
      <Routes>
        <Route
          path="/"
          element={
            <RequirePermission permission="sales.read">
              <LazyView>
                <Lazy />
              </LazyView>
            </RequirePermission>
          }
        />
      </Routes>,
      {
        initialRoute: '/',
        initialSessionOverride: {
          id: 'u1',
          name: 'No Perms',
          email: 'n@example.com',
          roles: ['OPERATOR'],
          permissions: [],
        },
      },
    );

    expect(await screen.findByRole('heading', { name: /403.*Access Denied/i })).toBeInTheDocument();
    expect(screen.queryByText('lazy-hello')).not.toBeInTheDocument();
  });

  it('allows navigation between eager and lazy routes', async () => {
    const Lazy = lazyWithRetry(() => Promise.resolve({ default: Hello }));

    render(
      <MemoryRouter initialEntries={['/lazy']}>
        <Routes>
          <Route path="/eager" element={<div>eager-view</div>} />
          <Route
            path="/lazy"
            element={
              <LazyView>
                <Lazy />
              </LazyView>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('lazy-hello')).toBeInTheDocument();
  });
});
