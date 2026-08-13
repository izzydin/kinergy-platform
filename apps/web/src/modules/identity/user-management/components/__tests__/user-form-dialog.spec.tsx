import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationProvider } from '../../../../../app/providers/notification-provider';
import { UserFormDialog } from '../user-form-dialog';

function mockFetchResponse(body: unknown, status = 200): jest.Mock {
  const textPayload = typeof body === 'string' ? body : JSON.stringify(body);
  const mockFn = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(textPayload),
    json: () => Promise.resolve(body),
  } as Response);
  global.fetch = mockFn as unknown as typeof fetch;
  return mockFn;
}

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderUserFormDialog(props: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = createTestQueryClient();

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <NotificationProvider>
          <UserFormDialog {...props} />
        </NotificationProvider>
      </QueryClientProvider>,
    ),
  };
}

describe('UserFormDialog Component', () => {
  const handleOpenChange = jest.fn();

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders modal dialog with form fields when open is true', () => {
    renderUserFormDialog({ open: true, onOpenChange: handleOpenChange });

    expect(screen.getByRole('heading', { name: /create user account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/access role/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/initial account status/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('shows required field validation errors when submitting empty form', async () => {
    renderUserFormDialog({ open: true, onOpenChange: handleOpenChange });

    const submitButton = screen.getByRole('button', { name: /create account/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Email address is required')).toBeInTheDocument();
      expect(screen.getByText('Name must be at least 2 characters')).toBeInTheDocument();
    });
  });

  it('shows invalid email format error when entering malformed email', async () => {
    renderUserFormDialog({ open: true, onOpenChange: handleOpenChange });

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'not-an-email' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid email address format')).toBeInTheDocument();
    });
  });

  it('submits valid form data and closes dialog on success', async () => {
    mockFetchResponse({
      id: 'usr_new_1',
      email: 'newuser@kinergy.io',
      name: 'New Operator',
      status: 'ACTIVE',
      roles: ['OPERATOR'],
      createdAt: '2026-08-13T16:00:00Z',
    });

    renderUserFormDialog({ open: true, onOpenChange: handleOpenChange });

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'newuser@kinergy.io' },
    });
    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: 'New Operator' },
    });
    fireEvent.change(screen.getByLabelText(/access role/i), {
      target: { value: 'OPERATOR' },
    });

    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/admin/users'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            email: 'newuser@kinergy.io',
            name: 'New Operator',
            role: 'OPERATOR',
            status: 'ACTIVE',
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(handleOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('maps 409 Duplicate Email server error to email field message', async () => {
    mockFetchResponse(
      { statusCode: 409, message: 'A user account with this email address already exists.' },
      409,
    );

    renderUserFormDialog({ open: true, onOpenChange: handleOpenChange });

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'existing@kinergy.io' },
    });
    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: 'Existing User' },
    });

    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(
        screen.getByText('A user account with this email address already exists.'),
      ).toBeInTheDocument();
    });
  });

  it('closes dialog without submitting when Cancel button is clicked', () => {
    renderUserFormDialog({ open: true, onOpenChange: handleOpenChange });

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);

    expect(handleOpenChange).toHaveBeenCalledWith(false);
  });
});
