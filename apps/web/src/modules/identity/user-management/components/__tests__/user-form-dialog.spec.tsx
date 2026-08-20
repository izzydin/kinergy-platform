import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationProvider } from '../../../../../app/providers/notification-provider';
import { UserFormDialog } from '../user-form-dialog';

function mockFetchResponse(body: unknown, status = 200, delayMs = 0): jest.Mock {
  const textPayload = typeof body === 'string' ? body : JSON.stringify(body);
  const mockFn = jest.fn().mockImplementation(() => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          ok: status >= 200 && status < 300,
          status,
          text: () => Promise.resolve(textPayload),
          json: () => Promise.resolve(body),
        } as Response);
      }, delayMs);
    });
  });
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

describe('UserFormDialog Component (Track C Integration)', () => {
  const handleOpenChange = jest.fn();

  afterEach(() => {
    jest.restoreAllMocks();
    handleOpenChange.mockClear();
  });

  it('renders modal dialog with standardized form fields and action controls', () => {
    renderUserFormDialog({ open: true, onOpenChange: handleOpenChange });

    expect(screen.getByRole('heading', { name: /create user account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/access role/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/initial account status/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('shows validation summary and field-level error messages on empty submission', async () => {
    renderUserFormDialog({ open: true, onOpenChange: handleOpenChange });

    const submitButton = screen.getByRole('button', { name: /create account/i });
    act(() => {
      fireEvent.click(submitButton);
    });

    await waitFor(() => {
      expect(screen.getByText('Please fix the following errors')).toBeInTheDocument();
      expect(screen.getAllByText('Email address is required')).toHaveLength(2);
      expect(screen.getAllByText('Name must be at least 2 characters')).toHaveLength(2);
    });
  });

  it('shows invalid email format error in summary and field message', async () => {
    renderUserFormDialog({ open: true, onOpenChange: handleOpenChange });

    act(() => {
      fireEvent.change(screen.getByLabelText(/email address/i), {
        target: { value: 'not-an-email' },
      });
      fireEvent.change(screen.getByLabelText(/full name/i), {
        target: { value: 'Valid Name' },
      });
      fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    });

    await waitFor(() => {
      expect(screen.getAllByText('Invalid email address format')).toHaveLength(2);
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

    act(() => {
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
    });

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

    act(() => {
      fireEvent.change(screen.getByLabelText(/email address/i), {
        target: { value: 'existing@kinergy.io' },
      });
      fireEvent.change(screen.getByLabelText(/full name/i), {
        target: { value: 'Existing User' },
      });
      fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    });

    await waitFor(() => {
      expect(
        screen.getByText('A user account with this email address already exists.'),
      ).toBeInTheDocument();
    });
  });

  it('closes dialog immediately when Cancel is clicked on clean form', () => {
    renderUserFormDialog({ open: true, onOpenChange: handleOpenChange });

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    act(() => {
      fireEvent.click(cancelButton);
    });

    expect(handleOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByText('Discard unsaved changes?')).not.toBeInTheDocument();
  });

  it('intercepts cancel with ConfirmDiscardDialog when form is dirty', async () => {
    renderUserFormDialog({ open: true, onOpenChange: handleOpenChange });

    // Make dirty
    act(() => {
      fireEvent.change(screen.getByLabelText(/full name/i), {
        target: { value: 'Draft User' },
      });
    });

    // Attempt cancel
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    });

    // Confirmation dialog appears
    await waitFor(() => {
      expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument();
    });
    expect(handleOpenChange).not.toHaveBeenCalled();

    // Choose "Discard changes"
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /discard changes/i }));
    });

    expect(handleOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps form open when user chooses "Keep editing" in discard confirmation', async () => {
    renderUserFormDialog({ open: true, onOpenChange: handleOpenChange });

    act(() => {
      fireEvent.change(screen.getByLabelText(/full name/i), {
        target: { value: 'Draft User' },
      });
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    });

    await waitFor(() => {
      expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument();
    });

    // Choose "Keep editing"
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /keep editing/i }));
    });

    expect(handleOpenChange).not.toHaveBeenCalled();
    expect(screen.queryByText('Discard unsaved changes?')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toHaveValue('Draft User');
  });

  it('shows pending state on submit button during in-flight mutation', async () => {
    mockFetchResponse({ id: 'usr_delayed' }, 200, 200);

    renderUserFormDialog({ open: true, onOpenChange: handleOpenChange });

    act(() => {
      fireEvent.change(screen.getByLabelText(/email address/i), {
        target: { value: 'delayed@kinergy.io' },
      });
      fireEvent.change(screen.getByLabelText(/full name/i), {
        target: { value: 'Delayed User' },
      });
      fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /creating user\.\.\./i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    });
  });
});
