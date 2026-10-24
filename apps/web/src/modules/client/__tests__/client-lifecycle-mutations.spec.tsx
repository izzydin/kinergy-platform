import '@testing-library/jest-dom';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { ClientEditDialog } from '../components/client-edit-dialog';
import { ClientArchiveDialog } from '../components/client-archive-dialog';
import { ClientRestoreDialog } from '../components/client-restore-dialog';
import { clientApi } from '../api/client-api';
import { renderWithProviders } from '../../../test/test-utils';
import type { ClientModel } from '../types/client.types';

jest.mock('../api/client-api', () => ({
  clientApi: {
    searchClients: jest.fn(),
    getClientProfile: jest.fn(),
    registerClient: jest.fn(),
    updateClient: jest.fn(),
    archiveClient: jest.fn(),
    restoreClient: jest.fn(),
    linkIdentity: jest.fn(),
    getClientTimeline: jest.fn(),
  },
}));

const mockActiveClient: ClientModel = {
  id: 'cli_01j9876543210abcdef11111',
  referenceNumber: 'CLI-2026-0001',
  firstName: 'Elena',
  lastName: 'Rostova',
  fullName: 'Elena Rostova',
  email: 'elena.rostova@example.com',
  phone: '+59171234567',
  status: 'ACTIVE',
  version: 2,
  identityId: null,
  createdAt: '2026-06-15T10:00:00.000Z',
  updatedAt: '2026-09-20T14:30:00.000Z',
};

const mockArchivedClient: ClientModel = {
  id: 'cli_01j9876543210abcdef22222',
  referenceNumber: 'CLI-2026-0002',
  firstName: 'Marcus',
  lastName: 'Vance',
  fullName: 'Marcus Vance',
  email: 'marcus.vance@example.com',
  phone: '+59179876543',
  status: 'ARCHIVED',
  version: 4,
  identityId: null,
  createdAt: '2026-01-10T08:00:00.000Z',
  updatedAt: '2026-08-01T12:00:00.000Z',
};

describe('Client Lifecycle Mutations & Optimistic Concurrency', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  describe('1. Profile Editing (ClientEditDialog)', () => {
    it('pre-populates form with authoritative client attributes', () => {
      renderWithProviders(
        <ClientEditDialog client={mockActiveClient} open={true} onOpenChange={jest.fn()} />,
        { queryClient },
      );

      expect(screen.getByLabelText(/First Name/i)).toHaveValue('Elena');
      expect(screen.getByLabelText(/Last Name/i)).toHaveValue('Rostova');
      expect(screen.getByLabelText(/Email Address/i)).toHaveValue('elena.rostova@example.com');
      expect(screen.getByLabelText(/Phone Number/i)).toHaveValue('+59171234567');
    });

    it('validates client-side constraints on required fields before submitting', async () => {
      renderWithProviders(
        <ClientEditDialog client={mockActiveClient} open={true} onOpenChange={jest.fn()} />,
        { queryClient },
      );

      const firstNameInput = screen.getByLabelText(/First Name/i);
      fireEvent.change(firstNameInput, { target: { value: '' } });
      fireEvent.blur(firstNameInput);

      const emailInput = screen.getByLabelText(/Email Address/i);
      fireEvent.change(emailInput, { target: { value: 'not-an-email' } });
      fireEvent.blur(emailInput);

      fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

      expect(await screen.findByText('First name is required.')).toBeInTheDocument();
      expect(screen.getByText('Please enter a valid email address.')).toBeInTheDocument();
      expect(clientApi.updateClient).not.toHaveBeenCalled();
    });

    it('submits correctly formatted DTO with optimistic concurrency expectedVersion', async () => {
      const handleOpenChange = jest.fn();
      const updatedMock: ClientModel = {
        ...mockActiveClient,
        firstName: 'Elena Maria',
        version: 3,
      };
      (clientApi.updateClient as jest.Mock).mockResolvedValue(updatedMock);

      renderWithProviders(
        <ClientEditDialog client={mockActiveClient} open={true} onOpenChange={handleOpenChange} />,
        { queryClient },
      );

      fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: 'Elena Maria' } });
      fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

      await waitFor(() => {
        expect(clientApi.updateClient).toHaveBeenCalledWith(mockActiveClient.id, {
          firstName: 'Elena Maria',
          lastName: 'Rostova',
          email: 'elena.rostova@example.com',
          phone: '+59171234567',
          expectedVersion: 2,
        });
      });

      expect(handleOpenChange).toHaveBeenCalledWith(false);
    });

    it('handles HTTP 412 optimistic locking failure (stale data)', async () => {
      const concurrencyError = new Error('Precondition Failed: version mismatch');
      (concurrencyError as unknown as { status: number }).status = 412;
      (clientApi.updateClient as jest.Mock).mockRejectedValue(concurrencyError);

      renderWithProviders(
        <ClientEditDialog client={mockActiveClient} open={true} onOpenChange={jest.fn()} />,
        { queryClient },
      );

      fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: 'New Name' } });
      fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

      expect(
        await screen.findByText(
          /Concurrency Conflict: This client record was modified by another user/i,
        ),
      ).toBeInTheDocument();
      // Form remains populated and interactive
      expect(screen.getByLabelText(/First Name/i)).toHaveValue('New Name');
    });

    it('handles HTTP 409 duplicate contact error and maps to target input field', async () => {
      const conflictError = new Error('Conflict: A client with this email already exists.');
      (conflictError as unknown as { status: number }).status = 409;
      (clientApi.updateClient as jest.Mock).mockRejectedValue(conflictError);

      renderWithProviders(
        <ClientEditDialog client={mockActiveClient} open={true} onOpenChange={jest.fn()} />,
        { queryClient },
      );

      fireEvent.change(screen.getByLabelText(/Email Address/i), {
        target: { value: 'taken@example.com' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

      const emailErrors = await screen.findAllByText(
        'This email address is already registered to another client profile.',
      );
      expect(emailErrors.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByLabelText(/Email Address/i)).toHaveValue('taken@example.com');
    });

    it('handles HTTP 422 archived client restriction error gracefully', async () => {
      const archivedError = new Error(
        'Unprocessable Entity: Cannot update archived client profile',
      );
      (archivedError as unknown as { status: number }).status = 422;
      (clientApi.updateClient as jest.Mock).mockRejectedValue(archivedError);

      renderWithProviders(
        <ClientEditDialog client={mockActiveClient} open={true} onOpenChange={jest.fn()} />,
        { queryClient },
      );

      fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

      expect(
        await screen.findByText(/Archived Record: Archived client records cannot be modified/i),
      ).toBeInTheDocument();
    });
  });

  describe('2. Client Archiving (ClientArchiveDialog)', () => {
    it('renders consequential warning dialog explaining service restrictions without inventing reason field', () => {
      renderWithProviders(
        <ClientArchiveDialog client={mockActiveClient} open={true} onOpenChange={jest.fn()} />,
        { queryClient },
      );

      expect(screen.getByRole('heading', { name: /Archive Client Profile/i })).toBeInTheDocument();
      expect(
        screen.getByText(/New appointment scheduling and check-in bookings will be restricted/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/All historical treatment sessions, clinical SOAP notes/i),
      ).toBeInTheDocument();

      // Confirms NO bogus reason field is present
      expect(screen.queryByLabelText(/Reason/i)).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText(/Reason/i)).not.toBeInTheDocument();
    });

    it('submits archive command with expectedVersion and closes dialog on success', async () => {
      const handleOpenChange = jest.fn();
      const archivedMock: ClientModel = {
        ...mockActiveClient,
        status: 'ARCHIVED',
        version: 3,
      };
      (clientApi.archiveClient as jest.Mock).mockResolvedValue(archivedMock);

      renderWithProviders(
        <ClientArchiveDialog
          client={mockActiveClient}
          open={true}
          onOpenChange={handleOpenChange}
        />,
        { queryClient },
      );

      const confirmBtn = screen.getByTestId('confirm-archive-button');
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(clientApi.archiveClient).toHaveBeenCalledWith(mockActiveClient.id, 2);
      });

      expect(handleOpenChange).toHaveBeenCalledWith(false);
    });

    it('handles 409 already archived conflict response', async () => {
      const conflictError = new Error('Client profile is already archived.');
      (conflictError as unknown as { status: number }).status = 409;
      (clientApi.archiveClient as jest.Mock).mockRejectedValue(conflictError);

      renderWithProviders(
        <ClientArchiveDialog client={mockActiveClient} open={true} onOpenChange={jest.fn()} />,
        { queryClient },
      );

      fireEvent.click(screen.getByTestId('confirm-archive-button'));

      expect(
        await screen.findByText(/Conflict: This client profile is already in archived status/i),
      ).toBeInTheDocument();
    });
  });

  describe('3. Client Restoration (ClientRestoreDialog)', () => {
    it('renders restoration dialog explaining active privilege re-activation', () => {
      renderWithProviders(
        <ClientRestoreDialog client={mockArchivedClient} open={true} onOpenChange={jest.fn()} />,
        { queryClient },
      );

      expect(screen.getByRole('heading', { name: /Restore Client Profile/i })).toBeInTheDocument();
      expect(
        screen.getByText(/New appointments and treatment sessions may be scheduled/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/The profile will appear under active directory filter views/i),
      ).toBeInTheDocument();
    });

    it('submits restore command with expectedVersion and closes dialog on success', async () => {
      const handleOpenChange = jest.fn();
      const restoredMock: ClientModel = {
        ...mockArchivedClient,
        status: 'ACTIVE',
        version: 5,
      };
      (clientApi.restoreClient as jest.Mock).mockResolvedValue(restoredMock);

      renderWithProviders(
        <ClientRestoreDialog
          client={mockArchivedClient}
          open={true}
          onOpenChange={handleOpenChange}
        />,
        { queryClient },
      );

      const confirmBtn = screen.getByTestId('confirm-restore-button');
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(clientApi.restoreClient).toHaveBeenCalledWith(mockArchivedClient.id, 4);
      });

      expect(handleOpenChange).toHaveBeenCalledWith(false);
    });

    it('handles 412 optimistic locking failure during restoration', async () => {
      const lockError = new Error('Precondition Failed');
      (lockError as unknown as { status: number }).status = 412;
      (clientApi.restoreClient as jest.Mock).mockRejectedValue(lockError);

      renderWithProviders(
        <ClientRestoreDialog client={mockArchivedClient} open={true} onOpenChange={jest.fn()} />,
        { queryClient },
      );

      fireEvent.click(screen.getByTestId('confirm-restore-button'));

      expect(
        await screen.findByText(
          /Concurrency Conflict: The client record was updated by another process/i,
        ),
      ).toBeInTheDocument();
    });
  });
});
