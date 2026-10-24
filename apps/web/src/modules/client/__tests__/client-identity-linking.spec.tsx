import '@testing-library/jest-dom';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { renderWithProviders } from '../../../test/test-utils';
import { ClientDetailsCard } from '../components/client-details-card';
import { ClientLinkIdentityDialog } from '../components/client-link-identity-dialog';
import { clientApi } from '../api/client-api';
import type { AuthUser } from '../../auth/domain/auth-state.types';
import type { ClientModel } from '../types/client.types';

jest.mock('../api/client-api', () => ({
  clientApi: {
    linkIdentity: jest.fn(),
  },
}));

const mockUnlinkedClient: ClientModel = {
  id: 'c1111111-1111-4111-8111-111111111111',
  referenceNumber: 'CLI-2026-00001',
  firstName: 'Lucas',
  lastName: 'Torres',
  fullName: 'Lucas Torres',
  email: 'lucas.torres@example.com',
  phone: '+59171112233',
  status: 'ACTIVE',
  version: 1,
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-01-15T10:00:00.000Z',
  identityId: null,
};

const mockLinkedClient: ClientModel = {
  ...mockUnlinkedClient,
  id: 'c2222222-2222-4222-8222-222222222222',
  referenceNumber: 'CLI-2026-00002',
  firstName: 'Valeria',
  lastName: 'Gomez',
  fullName: 'Valeria Gomez',
  identityId: '550e8400-e29b-41d4-a716-446655440000',
  version: 2,
};

const mockArchivedClient: ClientModel = {
  ...mockUnlinkedClient,
  id: 'c3333333-3333-4333-8333-333333333333',
  status: 'ARCHIVED',
};

const mockStaffUser: AuthUser = {
  id: 'staff-1',
  email: 'staff@kinergy.com',
  name: 'Staff Member',
  roles: ['Staff'],
  permissions: ['client:read', 'client:write'],
  tenantId: 'tenant_1',
};

const mockReadOnlyUser: AuthUser = {
  id: 'viewer-1',
  email: 'viewer@kinergy.com',
  name: 'Viewer Member',
  roles: ['Viewer'],
  permissions: ['client:read'],
  tenantId: 'tenant_1',
};

describe('Client Identity Linking Workflow & Relationship Integrity', () => {
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

  describe('1. Profile Entry Points & Authorization Checks', () => {
    it('renders "Link Identity" button for authorized staff on an unlinked client', () => {
      renderWithProviders(<ClientDetailsCard client={mockUnlinkedClient} />, {
        queryClient,
        initialSessionOverride: mockStaffUser,
      });

      expect(screen.getByTestId('client-identity-unlinked')).toHaveTextContent(
        'Not linked to user account',
      );
      expect(screen.getByTestId('link-identity-trigger-button')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Link user account identity/i }),
      ).toBeInTheDocument();
    });

    it('hides "Link Identity" button when user lacks client:write permission', () => {
      renderWithProviders(<ClientDetailsCard client={mockUnlinkedClient} />, {
        queryClient,
        initialSessionOverride: mockReadOnlyUser,
      });

      expect(screen.getByTestId('client-identity-unlinked')).toBeInTheDocument();
      expect(screen.queryByTestId('link-identity-trigger-button')).not.toBeInTheDocument();
    });

    it('displays linked Identity ID badge without exposing an unlink button for already-linked clients', () => {
      renderWithProviders(<ClientDetailsCard client={mockLinkedClient} />, {
        queryClient,
        initialSessionOverride: mockStaffUser,
      });

      expect(screen.getByTestId('client-identity-linked')).toHaveTextContent(
        '550e8400-e29b-41d4-a716-446655440000',
      );
      expect(screen.getByText(/Unlinking unsupported/i)).toBeInTheDocument();

      // Enforce domain invariant: unlinking is not supported by backend domain
      expect(screen.queryByRole('button', { name: /unlink/i })).not.toBeInTheDocument();
      expect(screen.queryByTestId('unlink-identity-button')).not.toBeInTheDocument();
    });

    it('does not display "Link Identity" button on archived clients', () => {
      renderWithProviders(<ClientDetailsCard client={mockArchivedClient} />, {
        queryClient,
        initialSessionOverride: mockStaffUser,
      });

      expect(screen.queryByTestId('link-identity-trigger-button')).not.toBeInTheDocument();
    });
  });

  describe('2. ClientLinkIdentityDialog Submission & Validation', () => {
    it('validates required Identity ID before submitting', async () => {
      renderWithProviders(
        <ClientLinkIdentityDialog
          client={mockUnlinkedClient}
          open={true}
          onOpenChange={jest.fn()}
        />,
        { queryClient, initialSessionOverride: mockStaffUser },
      );

      const input = screen.getByTestId('link-identity-input');
      fireEvent.change(input, { target: { value: '' } });
      fireEvent.blur(input);

      fireEvent.click(screen.getByTestId('submit-link-identity-button'));

      const errors = await screen.findAllByText('Identity ID is required.');
      expect(errors.length).toBeGreaterThan(0);
      expect(clientApi.linkIdentity).not.toHaveBeenCalled();
    });

    it('submits correctly structured DTO and closes dialog upon successful linking', async () => {
      const handleOpenChange = jest.fn();
      const updatedMock: ClientModel = {
        ...mockUnlinkedClient,
        identityId: '550e8400-e29b-41d4-a716-446655440000',
        version: 2,
      };
      (clientApi.linkIdentity as jest.Mock).mockResolvedValue(updatedMock);

      renderWithProviders(
        <ClientLinkIdentityDialog
          client={mockUnlinkedClient}
          open={true}
          onOpenChange={handleOpenChange}
        />,
        { queryClient, initialSessionOverride: mockStaffUser },
      );

      const input = screen.getByTestId('link-identity-input');
      fireEvent.change(input, { target: { value: '550e8400-e29b-41d4-a716-446655440000' } });
      fireEvent.click(screen.getByTestId('submit-link-identity-button'));

      await waitFor(() => {
        expect(clientApi.linkIdentity).toHaveBeenCalledWith(mockUnlinkedClient.id, {
          identityId: '550e8400-e29b-41d4-a716-446655440000',
        });
      });

      expect(handleOpenChange).toHaveBeenCalledWith(false);
    });

    it('handles HTTP 409 Conflict (already-linked client or duplicate identity link)', async () => {
      const conflictError = new Error('Client is already linked to an identity');
      (conflictError as unknown as { status: number }).status = 409;
      (clientApi.linkIdentity as jest.Mock).mockRejectedValue(conflictError);

      renderWithProviders(
        <ClientLinkIdentityDialog
          client={mockUnlinkedClient}
          open={true}
          onOpenChange={jest.fn()}
        />,
        { queryClient, initialSessionOverride: mockStaffUser },
      );

      const input = screen.getByTestId('link-identity-input');
      fireEvent.change(input, { target: { value: 'usr_already_linked' } });
      fireEvent.click(screen.getByTestId('submit-link-identity-button'));

      const conflictMsgs = await screen.findAllByText(
        /This client is already linked to an identity account or the specified identity is already linked to another client profile/i,
      );
      expect(conflictMsgs.length).toBeGreaterThan(0);
    });

    it('handles HTTP 404 Not Found gracefully', async () => {
      const notFoundError = new Error('Client not found');
      (notFoundError as unknown as { status: number }).status = 404;
      (clientApi.linkIdentity as jest.Mock).mockRejectedValue(notFoundError);

      renderWithProviders(
        <ClientLinkIdentityDialog
          client={mockUnlinkedClient}
          open={true}
          onOpenChange={jest.fn()}
        />,
        { queryClient, initialSessionOverride: mockStaffUser },
      );

      const input = screen.getByTestId('link-identity-input');
      fireEvent.change(input, { target: { value: 'usr_target' } });
      fireEvent.click(screen.getByTestId('submit-link-identity-button'));

      expect(
        await screen.findByText('The target client record could not be found.'),
      ).toBeInTheDocument();
    });

    it('handles HTTP 403 Forbidden error', async () => {
      const forbiddenError = new Error('Forbidden resource');
      (forbiddenError as unknown as { status: number }).status = 403;
      (forbiddenError as unknown as { statusCode: number }).statusCode = 403;
      (clientApi.linkIdentity as jest.Mock).mockRejectedValue(forbiddenError);

      renderWithProviders(
        <ClientLinkIdentityDialog
          client={mockUnlinkedClient}
          open={true}
          onOpenChange={jest.fn()}
        />,
        { queryClient, initialSessionOverride: mockStaffUser },
      );

      const input = screen.getByTestId('link-identity-input');
      fireEvent.change(input, { target: { value: 'usr_target' } });
      fireEvent.click(screen.getByTestId('submit-link-identity-button'));

      expect(
        await screen.findByText(
          /Access Denied: You do not have permission to link identity accounts/i,
        ),
      ).toBeInTheDocument();
    });
  });
});
