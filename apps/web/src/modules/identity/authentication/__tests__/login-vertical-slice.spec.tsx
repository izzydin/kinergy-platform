import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../../../../app/providers/auth-provider';
import { ProtectedRoute } from '../../../../app/routes/protected-route';
import { PublicRoute } from '../../../../app/routes/public-route';
import { authTokenStore } from '../../../../shared/auth/auth-token-store';
import { LoginRoute } from '../index';

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function createMockResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response;
}

function extractUrl(url: unknown): string {
  if (typeof url === 'string') return url;
  if (url && typeof url === 'object' && 'url' in url) {
    return String((url as { url: unknown }).url);
  }
  return String(url);
}

const MOCK_OPERATOR_USER = {
  id: 'usr_slice_operator_99',
  email: 'operator@kinergy.io',
  name: 'Enterprise Operator',
  roles: ['OPERATOR'],
  permissions: ['client:read', 'energy:read'],
  tenantId: 'tenant_slice_default',
};

describe('Track B — Step B1.5: Login Vertical Slice Testing Suite', () => {
  let queryClient: QueryClient;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    act(() => {
      authTokenStore.clearSession();
    });
    queryClient = createTestQueryClient();

    if (!global.fetch) {
      (global as unknown as { fetch: typeof fetch }).fetch = jest.fn();
    }

    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = extractUrl(input);
      if (url.includes('/api/v1/auth/login')) {
        return createMockResponse({
          accessToken: 'mock-jwt-slice-token-200',
          tokenType: 'Bearer',
          expiresIn: 900,
          user: MOCK_OPERATOR_USER,
        });
      }
      if (url.includes('/api/v1/auth/me')) {
        return createMockResponse(MOCK_OPERATOR_USER);
      }
      return createMockResponse({ message: 'Not found' }, 404);
    });
  });

  afterEach(() => {
    if (fetchSpy) {
      fetchSpy.mockRestore();
    }
    queryClient.clear();
    act(() => {
      authTokenStore.clearSession();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Initial Form State
  // ───────────────────────────────────────────────────────────────────────────

  it('1. Initial Form State — renders accessible branding, header, inputs, and submit button', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/auth/login']}>
          <AuthProvider skipBootstrap>
            <LoginRoute />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByRole('heading', { level: 1, name: /sign in/i })).toBeInTheDocument();

    const emailInput = screen.getByLabelText(/^email address/i);
    expect(emailInput).toBeInTheDocument();
    expect(emailInput).toHaveAttribute('type', 'email');
    expect(emailInput).toHaveAttribute('autocomplete', 'username');

    const passwordInput = screen.getByLabelText(/^password/i);
    expect(passwordInput).toBeInTheDocument();
    expect(passwordInput).toHaveAttribute('type', 'password');
    expect(passwordInput).toHaveAttribute('autocomplete', 'current-password');

    const submitButton = screen.getByRole('button', { name: /sign in/i });
    expect(submitButton).toBeInTheDocument();
    expect(submitButton).not.toBeDisabled();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Field Validation Error
  // ───────────────────────────────────────────────────────────────────────────

  it('2. Field Validation Error — intercepts submission client-side and presents inline error feedback', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/auth/login']}>
          <AuthProvider skipBootstrap>
            <LoginRoute />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const emailInput = screen.getByLabelText(/^email address/i);
    const passwordInput = screen.getByLabelText(/^password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    await act(async () => {
      fireEvent.change(emailInput, { target: { value: 'invalid-email-format' } });
      fireEvent.change(passwordInput, { target: { value: 'Password123!' } });
      fireEvent.click(submitButton);
    });

    await waitFor(() => {
      expect(screen.getByText(/please enter a valid email address/i)).toBeInTheDocument();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Loading / Submitting State
  // ───────────────────────────────────────────────────────────────────────────

  it('3. Loading/Submitting State — displays spinner, updates button text, and disables controls during request in-flight', async () => {
    let resolveLogin!: (res: Response) => void;
    const pendingLogin = new Promise<Response>((resolve) => {
      resolveLogin = resolve;
    });

    fetchSpy.mockImplementation((input) => {
      const url = extractUrl(input);
      if (url.includes('/api/v1/auth/login')) {
        return pendingLogin;
      }
      return Promise.resolve(createMockResponse({ status: 'ok' }));
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/auth/login']}>
          <AuthProvider skipBootstrap>
            <LoginRoute />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const emailInput = screen.getByLabelText(/^email address/i);
    const passwordInput = screen.getByLabelText(/^password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    await act(async () => {
      fireEvent.change(emailInput, { target: { value: 'operator@kinergy.io' } });
      fireEvent.change(passwordInput, { target: { value: 'Password123!' } });
      fireEvent.click(submitButton);
    });

    // Verify loading UI state during in-flight request
    expect(screen.getByRole('button', { name: /signing in\.\.\./i })).toBeDisabled();
    expect(emailInput).toBeDisabled();
    expect(passwordInput).toBeDisabled();

    // Resolve pending login response
    await act(async () => {
      resolveLogin(
        createMockResponse({
          accessToken: 'mock-jwt-delayed-token',
          tokenType: 'Bearer',
          expiresIn: 900,
          user: MOCK_OPERATOR_USER,
        }),
      );
    });

    await waitFor(() => {
      expect(authTokenStore.getAccessToken()).toBe('mock-jwt-delayed-token');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Invalid Credentials (401)
  // ───────────────────────────────────────────────────────────────────────────

  it('4. Invalid Credentials — processes transport 401 response and renders form-level alert', async () => {
    fetchSpy.mockImplementation(async (input) => {
      const url = extractUrl(input);
      if (url.includes('/api/v1/auth/login')) {
        return createMockResponse(
          {
            statusCode: 401,
            error: 'Unauthorized',
            message: 'Invalid email or password.',
            timestamp: new Date().toISOString(),
            path: '/api/v1/auth/login',
          },
          401,
        );
      }
      return createMockResponse({ message: 'Not found' }, 404);
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/auth/login']}>
          <AuthProvider skipBootstrap>
            <LoginRoute />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const emailInput = screen.getByLabelText(/^email address/i);
    const passwordInput = screen.getByLabelText(/^password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    await act(async () => {
      fireEvent.change(emailInput, { target: { value: 'invalid@kinergy.io' } });
      fireEvent.change(passwordInput, { target: { value: 'wrong-password' } });
      fireEvent.click(submitButton);
    });

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(screen.getByText(/authentication failed/i)).toBeInTheDocument();
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Account Blocked / Inactive (401)
  // ───────────────────────────────────────────────────────────────────────────

  it('5. Account Blocked/Inactive — processes 401 blocked user response and presents account restriction notice', async () => {
    fetchSpy.mockImplementation(async (input) => {
      const url = extractUrl(input);
      if (url.includes('/api/v1/auth/login')) {
        return createMockResponse(
          {
            statusCode: 401,
            error: 'Unauthorized',
            message: 'User account is inactive or blocked.',
            timestamp: new Date().toISOString(),
            path: '/api/v1/auth/login',
          },
          401,
        );
      }
      return createMockResponse({ message: 'Not found' }, 404);
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/auth/login']}>
          <AuthProvider skipBootstrap>
            <LoginRoute />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const emailInput = screen.getByLabelText(/^email address/i);
    const passwordInput = screen.getByLabelText(/^password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    await act(async () => {
      fireEvent.change(emailInput, { target: { value: 'blocked@kinergy.io' } });
      fireEvent.change(passwordInput, { target: { value: 'Password123!' } });
      fireEvent.click(submitButton);
    });

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(
        screen.getByText(/invalid email or password|user account is inactive or blocked/i),
      ).toBeInTheDocument();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Network Failure State
  // ───────────────────────────────────────────────────────────────────────────

  it('6. Network Failure — handles network transport crash and presents normalized network failure alert', async () => {
    fetchSpy.mockImplementation(async (input) => {
      const url = extractUrl(input);
      if (url.includes('/api/v1/auth/login')) {
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      return createMockResponse({ message: 'Not found' }, 404);
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/auth/login']}>
          <AuthProvider skipBootstrap>
            <LoginRoute />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const emailInput = screen.getByLabelText(/^email address/i);
    const passwordInput = screen.getByLabelText(/^password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    await act(async () => {
      fireEvent.change(emailInput, { target: { value: 'operator@kinergy.io' } });
      fireEvent.change(passwordInput, { target: { value: 'Password123!' } });
      fireEvent.click(submitButton);
    });

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(screen.getByText(/network connection lost/i)).toBeInTheDocument();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. Unexpected Server Failure State (500)
  // ───────────────────────────────────────────────────────────────────────────

  it('7. Unexpected Server Failure — handles 500 server error and presents normalized gateway failure alert', async () => {
    fetchSpy.mockImplementation(async (input) => {
      const url = extractUrl(input);
      if (url.includes('/api/v1/auth/login')) {
        return createMockResponse(
          {
            statusCode: 500,
            error: 'Internal Server Error',
            message: 'Authentication gateway service failure',
            timestamp: new Date().toISOString(),
            path: '/api/v1/auth/login',
          },
          500,
        );
      }
      return createMockResponse({ message: 'Not found' }, 404);
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/auth/login']}>
          <AuthProvider skipBootstrap>
            <LoginRoute />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const emailInput = screen.getByLabelText(/^email address/i);
    const passwordInput = screen.getByLabelText(/^password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    await act(async () => {
      fireEvent.change(emailInput, { target: { value: 'operator@kinergy.io' } });
      fireEvent.change(passwordInput, { target: { value: 'Password123!' } });
      fireEvent.click(submitButton);
    });

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(screen.getByText(/an unexpected server error occurred/i)).toBeInTheDocument();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. Successful Login State
  // ───────────────────────────────────────────────────────────────────────────

  it('8. Successful Login — stores JWT token in token store and updates AuthProvider session state', async () => {
    fetchSpy.mockImplementation(async (input) => {
      const url = extractUrl(input);
      if (url.includes('/api/v1/auth/login')) {
        return createMockResponse({
          accessToken: 'mock-jwt-slice-token-200',
          tokenType: 'Bearer',
          expiresIn: 900,
          user: MOCK_OPERATOR_USER,
        });
      }
      if (url.includes('/api/v1/auth/me')) {
        return createMockResponse(MOCK_OPERATOR_USER);
      }
      return createMockResponse({ message: 'Not found' }, 404);
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/auth/login']}>
          <AuthProvider skipBootstrap>
            <LoginRoute />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const emailInput = screen.getByLabelText(/^email address/i);
    const passwordInput = screen.getByLabelText(/^password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    await act(async () => {
      fireEvent.change(emailInput, { target: { value: 'operator@kinergy.io' } });
      fireEvent.change(passwordInput, { target: { value: 'Password123!' } });
      fireEvent.click(submitButton);
    });

    await waitFor(() => {
      expect(authTokenStore.getAccessToken()).toBe('mock-jwt-slice-token-200');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 9. Authenticated Navigation & Return Location Flow
  // ───────────────────────────────────────────────────────────────────────────

  it('9. Authenticated Navigation — completes end-to-end user flow from unauthenticated attempt to target route navigation', async () => {
    let isMockAuthenticated = false;

    fetchSpy.mockImplementation(async (input) => {
      const url = extractUrl(input);
      if (url.includes('/api/v1/auth/refresh')) {
        if (isMockAuthenticated) {
          return createMockResponse({ accessToken: 'mock-jwt-slice-token-200', expiresIn: 900 });
        }
        return createMockResponse({ message: 'No session' }, 401);
      }
      if (url.includes('/api/v1/auth/login')) {
        isMockAuthenticated = true;
        return createMockResponse({
          accessToken: 'mock-jwt-slice-token-200',
          tokenType: 'Bearer',
          expiresIn: 900,
          user: MOCK_OPERATOR_USER,
        });
      }
      if (url.includes('/api/v1/auth/me')) {
        return createMockResponse(MOCK_OPERATOR_USER);
      }
      return createMockResponse({ message: 'Not found' }, 404);
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/clients']}>
          <AuthProvider>
            <Routes>
              <Route element={<PublicRoute />}>
                <Route path="/auth/login" element={<LoginRoute />} />
              </Route>
              <Route element={<ProtectedRoute />}>
                <Route
                  path="/clients"
                  element={<div>Protected Client Profiles Directory Target</div>}
                />
              </Route>
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // 1. Initially unauthenticated -> Redirected to /auth/login with ?redirect=%2Fclients
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /sign in/i })).toBeInTheDocument();
    });

    const emailInput = screen.getByLabelText(/^email address/i);
    const passwordInput = screen.getByLabelText(/^password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    // 2. Submit valid credentials
    await act(async () => {
      fireEvent.change(emailInput, { target: { value: 'operator@kinergy.io' } });
      fireEvent.change(passwordInput, { target: { value: 'Password123!' } });
      fireEvent.click(submitButton);
    });

    // 3. Authenticated -> Automatic post-login navigation to preserved return location /clients
    await waitFor(() => {
      expect(screen.getByText('Protected Client Profiles Directory Target')).toBeInTheDocument();
    });

    expect(screen.queryByRole('heading', { level: 1, name: /sign in/i })).not.toBeInTheDocument();
  });
});
