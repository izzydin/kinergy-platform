import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationProvider } from '../../../../../app/providers/notification-provider';
import type { ManagedUser } from '../../domain/user.types';
import { UserEditDialog } from '../user-edit-dialog';

const MOCK_TARGET_USER: ManagedUser = {
  id: 'usr_target_123',
  email: 'operator@kinergy.io',
  name: 'Grid Operator',
  status: 'ACTIVE',
  roles: ['OPERATOR'],
  permissions: ['manage:users'],
  tenantId: 'tenant_kinergy_master',
  lastLoginAt: '2026-08-01T10:00:00Z',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-08-01T10:00:00Z',
};

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

function renderUserEditDialog(props: {
  user: ManagedUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = createTestQueryClient();

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <NotificationProvider>
          <UserEditDialog {...props} />
        </NotificationProvider>
      </QueryClientProvider>,
    ),
  };
}

describe('UserEditDialog Component (Track C Integration)', () => {
  const handleOpenChange = jest.fn();

  afterEach(() => {
    jest.restoreAllMocks();
    handleOpenChange.mockClear();
  });

  it('renders modal dialog with pre-filled user values when open is true', () => {
    renderUserEditDialog({ user: MOCK_TARGET_USER, open: true, onOpenChange: handleOpenChange });

    expect(screen.getByRole('heading', { name: /edit user profile/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email address \(read-only\)/i)).toHaveValue(
      'operator@kinergy.io',
    );
    expect(screen.getByLabelText(/full name/i)).toHaveValue('Grid Operator');
    expect(screen.getByLabelText(/access role/i)).toHaveValue('OPERATOR');
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });

  it('shows validation summary and error when full name is cleared below 2 characters', async () => {
    renderUserEditDialog({ user: MOCK_TARGET_USER, open: true, onOpenChange: handleOpenChange });

    const nameInput = screen.getByLabelText(/full name/i);
    act(() => {
      fireEvent.change(nameInput, { target: { value: 'A' } });
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    });

    await waitFor(() => {
      expect(screen.getByText('Please fix the following errors')).toBeInTheDocument();
      expect(screen.getAllByText('Name must be at least 2 characters')).toHaveLength(2);
    });
  });

  it('submits updated profile data and closes dialog on success', async () => {
    mockFetchResponse({
      ...MOCK_TARGET_USER,
      name: 'Updated Grid Operator',
      roles: ['ADMIN'],
    });

    renderUserEditDialog({ user: MOCK_TARGET_USER, open: true, onOpenChange: handleOpenChange });

    act(() => {
      fireEvent.change(screen.getByLabelText(/full name/i), {
        target: { value: 'Updated Grid Operator' },
      });
      fireEvent.change(screen.getByLabelText(/access role/i), {
        target: { value: 'ADMIN' },
      });
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/admin/users/usr_target_123'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            name: 'Updated Grid Operator',
            role: 'ADMIN',
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(handleOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('closes dialog immediately when Cancel is clicked on clean form', () => {
    renderUserEditDialog({ user: MOCK_TARGET_USER, open: true, onOpenChange: handleOpenChange });

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    act(() => {
      fireEvent.click(cancelButton);
    });

    expect(handleOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByText('Discard unsaved changes?')).not.toBeInTheDocument();
  });

  it('intercepts cancel with ConfirmDiscardDialog when form is dirty', async () => {
    renderUserEditDialog({ user: MOCK_TARGET_USER, open: true, onOpenChange: handleOpenChange });

    // Modify field
    act(() => {
      fireEvent.change(screen.getByLabelText(/full name/i), {
        target: { value: 'Modified Name' },
      });
    });

    // Attempt cancel
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    });

    await waitFor(() => {
      expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument();
    });
    expect(handleOpenChange).not.toHaveBeenCalled();

    // Confirm discard
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /discard changes/i }));
    });

    expect(handleOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows pending state during in-flight edit mutation', async () => {
    mockFetchResponse({ ...MOCK_TARGET_USER }, 200, 200);

    renderUserEditDialog({ user: MOCK_TARGET_USER, open: true, onOpenChange: handleOpenChange });

    act(() => {
      fireEvent.change(screen.getByLabelText(/full name/i), {
        target: { value: 'In-Flight Update' },
      });
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /saving changes\.\.\./i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    });
  });
});
