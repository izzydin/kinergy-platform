import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../../../app/providers/auth-provider';
import { authTokenStore } from '../../../../shared/auth/auth-token-store';
import { LoginRoute } from '../routes/login-route';

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

const MOCK_USER = {
  id: 'usr-view-123',
  email: 'operator@kinergy.io',
  name: 'Enterprise Operator',
  roles: ['OPERATOR'],
  permissions: ['client:read'],
  tenantId: 'tenant_default',
};

describe('Login UI Screen & Accessibility Component Suite (Step B1.3)', () => {
  let queryClient: QueryClient;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    authTokenStore.clearSession();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    if (!global.fetch) {
      (global as unknown as { fetch: typeof fetch }).fetch = jest.fn();
    }

    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = extractUrl(input);
      if (url.includes('/api/v1/auth/login')) {
        return createMockResponse({
          accessToken: 'mock-jwt-token-view-b1.3',
          tokenType: 'Bearer',
          expiresIn: 900,
          user: MOCK_USER,
        });
      }
      if (url.includes('/api/v1/auth/me')) {
        return createMockResponse(MOCK_USER);
      }
      return createMockResponse({ message: 'Not found' }, 404);
    });
  });

  afterEach(() => {
    if (fetchSpy) {
      fetchSpy.mockRestore();
    }
    queryClient.clear();
    authTokenStore.clearSession();
  });

  const renderLoginRoute = (onSuccess?: () => void) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/auth/login']}>
          <AuthProvider skipBootstrap>
            <LoginRoute onSuccess={onSuccess} />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Initial UI Rendering & Accessibility Attributes
  // ───────────────────────────────────────────────────────────────────────────

  it('renders login header, branding title, email input, password input, and submit button', () => {
    renderLoginRoute();

    expect(screen.getByRole('heading', { level: 1, name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();

    const emailInput = screen.getByLabelText(/^email address/i);
    expect(emailInput).toHaveAttribute('type', 'email');
    expect(emailInput).toHaveAttribute('autocomplete', 'username');

    const passwordInput = screen.getByLabelText(/^password/i);
    expect(passwordInput).toHaveAttribute('type', 'password');
    expect(passwordInput).toHaveAttribute('autocomplete', 'current-password');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Password Show/Hide Toggle Interaction
  // ───────────────────────────────────────────────────────────────────────────

  it('toggles password visibility when clicking show/hide password button', async () => {
    renderLoginRoute();

    const passwordInput = screen.getByLabelText(/^password/i);
    const toggleButton = screen.getByRole('button', { name: /show password/i });

    expect(passwordInput).toHaveAttribute('type', 'password');

    await act(async () => {
      fireEvent.click(toggleButton);
    });

    expect(passwordInput).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: /hide password/i })).toBeInTheDocument();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Client-Side Field Validation Feedback
  // ───────────────────────────────────────────────────────────────────────────

  it('displays inline field validation errors when submitting invalid email format', async () => {
    renderLoginRoute();

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
  // 4. Form-Level Authentication Error Alert
  // ───────────────────────────────────────────────────────────────────────────

  it('renders form-level Alert component with generic message on 401 Unauthorized response', async () => {
    fetchSpy.mockImplementation(async (input) => {
      const url = extractUrl(input);
      if (url.includes('/api/v1/auth/login')) {
        return createMockResponse({ message: 'Invalid credentials' }, 401);
      }
      return createMockResponse({ message: 'Not found' }, 404);
    });

    renderLoginRoute();

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
  // 5. Successful Submission & Loading UX
  // ───────────────────────────────────────────────────────────────────────────

  it('submits valid credentials, shows loading state, and invokes onSuccess callback', async () => {
    const handleSuccess = jest.fn();
    renderLoginRoute(handleSuccess);

    const emailInput = screen.getByLabelText(/^email address/i);
    const passwordInput = screen.getByLabelText(/^password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    await act(async () => {
      fireEvent.change(emailInput, { target: { value: 'operator@kinergy.io' } });
      fireEvent.change(passwordInput, { target: { value: 'Password123!' } });
      fireEvent.click(submitButton);
    });

    await waitFor(() => {
      expect(authTokenStore.getAccessToken()).toBe('mock-jwt-token-view-b1.3');
      expect(handleSuccess).toHaveBeenCalledTimes(1);
    });
  });
});
