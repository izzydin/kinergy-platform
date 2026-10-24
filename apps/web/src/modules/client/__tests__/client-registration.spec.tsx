import '@testing-library/jest-dom';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { ClientCreatePage } from '../routes/client-create-page';
import { clientApi } from '../api/client-api';
import { renderWithProviders } from '../../../test/test-utils';
import { ConflictError, NetworkError } from '../../../shared/api/api-error';
import type { AuthUser } from '../../auth/domain/auth-state.types';
import type { RegisterClientResponseDTO } from '../types/client.types';

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

const mockStaffUser: AuthUser = {
  id: 'usr_staff_1',
  email: 'reception@kinergy.test',
  name: 'Reception Staff',
  roles: ['Receptionist'],
  permissions: ['client:read', 'client:write'],
  tenantId: 'tenant_1',
};

const mockReadOnlyUser: AuthUser = {
  id: 'usr_readonly_1',
  email: 'auditor@kinergy.test',
  name: 'Auditor',
  roles: ['Auditor'],
  permissions: ['client:read'],
  tenantId: 'tenant_1',
};

const sampleRegisteredClient: RegisterClientResponseDTO = {
  id: 'cli_01j9876543210abcdef99999',
  referenceNumber: 'CLI-2026-99999',
  identityId: null,
  firstName: 'Carlos',
  lastName: 'Santana',
  email: 'carlos.santana@example.com',
  phone: '+59170012345',
  status: 'ACTIVE',
  version: 1,
  createdAt: '2026-10-23T19:00:00.000Z',
  updatedAt: '2026-10-23T19:00:00.000Z',
};

describe('Client Registration Experience & Domain Contract', () => {
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

  describe('Authorization & Access Control', () => {
    it('renders 403 ForbiddenView when user lacks client:write permission', () => {
      renderWithProviders(<ClientCreatePage />, {
        queryClient,
        initialRoute: '/clients/new',
        initialSessionOverride: mockReadOnlyUser,
      });

      expect(
        screen.getByText(/Access Denied: Missing required permission 'client:write'/i),
      ).toBeInTheDocument();
      expect(clientApi.registerClient).not.toHaveBeenCalled();
    });

    it('renders registration form when user has client:write permission', () => {
      renderWithProviders(<ClientCreatePage />, {
        queryClient,
        initialRoute: '/clients/new',
        initialSessionOverride: mockStaffUser,
      });

      expect(screen.getByTestId('client-create-page')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /Register Client/i })).toBeInTheDocument();
      expect(screen.getByTestId('first-name-input')).toBeInTheDocument();
      expect(screen.getByTestId('last-name-input')).toBeInTheDocument();
      expect(screen.getByTestId('email-input')).toBeInTheDocument();
      expect(screen.getByTestId('phone-input')).toBeInTheDocument();
    });
  });

  describe('Form Validation & Error Feedback', () => {
    it('displays required validation errors on empty submission without calling API', async () => {
      renderWithProviders(<ClientCreatePage />, {
        queryClient,
        initialRoute: '/clients/new',
        initialSessionOverride: mockStaffUser,
      });

      const submitBtn = screen.getByTestId('submit-registration-button');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/First name is required/i)).toBeInTheDocument();
        expect(screen.getByText(/Last name is required/i)).toBeInTheDocument();
        expect(screen.getByText(/Email address is required/i)).toBeInTheDocument();
        expect(screen.getByText(/Phone number is required/i)).toBeInTheDocument();
      });

      expect(clientApi.registerClient).not.toHaveBeenCalled();
    });

    it('validates invalid email format and displays actionable feedback', async () => {
      renderWithProviders(<ClientCreatePage />, {
        queryClient,
        initialRoute: '/clients/new',
        initialSessionOverride: mockStaffUser,
      });

      const emailInput = screen.getByTestId('email-input');
      fireEvent.change(emailInput, { target: { value: 'invalid-email' } });
      fireEvent.blur(emailInput);

      await waitFor(() => {
        expect(screen.getByText(/Please enter a valid email address/i)).toBeInTheDocument();
      });
    });

    it('validates invalid phone number and displays actionable feedback', async () => {
      renderWithProviders(<ClientCreatePage />, {
        queryClient,
        initialRoute: '/clients/new',
        initialSessionOverride: mockStaffUser,
      });

      const phoneInput = screen.getByTestId('phone-input');
      fireEvent.change(phoneInput, { target: { value: '123' } });
      fireEvent.blur(phoneInput);

      await waitFor(() => {
        expect(screen.getByText(/Please enter a valid phone number/i)).toBeInTheDocument();
      });
    });
  });

  describe('Successful Registration & DTO Construction', () => {
    it('submits correctly normalized DTO and disables button during in-flight submission', async () => {
      (clientApi.registerClient as jest.Mock).mockResolvedValue(sampleRegisteredClient);

      renderWithProviders(<ClientCreatePage />, {
        queryClient,
        initialRoute: '/clients/new',
        initialSessionOverride: mockStaffUser,
      });

      fireEvent.change(screen.getByTestId('first-name-input'), { target: { value: ' Carlos ' } });
      fireEvent.change(screen.getByTestId('last-name-input'), { target: { value: ' Santana ' } });
      fireEvent.change(screen.getByTestId('email-input'), {
        target: { value: ' Carlos.Santana@Example.COM ' },
      });
      fireEvent.change(screen.getByTestId('phone-input'), { target: { value: ' 70012345 ' } });

      const submitBtn = screen.getByTestId('submit-registration-button');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(clientApi.registerClient).toHaveBeenCalledWith({
          firstName: 'Carlos',
          lastName: 'Santana',
          email: 'carlos.santana@example.com',
          phone: '+59170012345',
          identityId: undefined,
          bypassSoftDuplicates: false,
        });
      });
    });

    it('submits optional identityId when provided', async () => {
      (clientApi.registerClient as jest.Mock).mockResolvedValue(sampleRegisteredClient);

      renderWithProviders(<ClientCreatePage />, {
        queryClient,
        initialRoute: '/clients/new',
        initialSessionOverride: mockStaffUser,
      });

      fireEvent.change(screen.getByTestId('first-name-input'), { target: { value: 'Carlos' } });
      fireEvent.change(screen.getByTestId('last-name-input'), { target: { value: 'Santana' } });
      fireEvent.change(screen.getByTestId('email-input'), {
        target: { value: 'carlos@example.com' },
      });
      fireEvent.change(screen.getByTestId('phone-input'), { target: { value: '+59170012345' } });
      fireEvent.change(screen.getByTestId('identity-id-input'), {
        target: { value: '550e8400-e29b-41d4-a716-446655440000' },
      });

      fireEvent.click(screen.getByTestId('submit-registration-button'));

      await waitFor(() => {
        expect(clientApi.registerClient).toHaveBeenCalledWith(
          expect.objectContaining({
            identityId: '550e8400-e29b-41d4-a716-446655440000',
          }),
        );
      });
    });
  });

  describe('Duplicate Detection & Error Handling', () => {
    it('handles hard duplicate email conflict: maps error to email field and preserves input', async () => {
      const conflictError = new ConflictError(
        "Hard Duplicate Rejection: A client profile already exists with the given email 'carlos.santana@example.com'.",
      );
      (clientApi.registerClient as jest.Mock).mockRejectedValue(conflictError);

      renderWithProviders(<ClientCreatePage />, {
        queryClient,
        initialRoute: '/clients/new',
        initialSessionOverride: mockStaffUser,
      });

      fireEvent.change(screen.getByTestId('first-name-input'), { target: { value: 'Carlos' } });
      fireEvent.change(screen.getByTestId('last-name-input'), { target: { value: 'Santana' } });
      fireEvent.change(screen.getByTestId('email-input'), {
        target: { value: 'carlos.santana@example.com' },
      });
      fireEvent.change(screen.getByTestId('phone-input'), { target: { value: '+59170012345' } });

      fireEvent.click(screen.getByTestId('submit-registration-button'));

      await waitFor(() => {
        expect(
          screen.getByText(/An active client with this email address already exists/i),
        ).toBeInTheDocument();
      });

      // User's input is preserved
      expect(screen.getByTestId('first-name-input')).toHaveValue('Carlos');
      expect(screen.getByTestId('last-name-input')).toHaveValue('Santana');
      expect(screen.getByTestId('email-input')).toHaveValue('carlos.santana@example.com');
      expect(screen.getByTestId('phone-input')).toHaveValue('+59170012345');
    });

    it('handles hard duplicate phone conflict: maps error to phone field and preserves input', async () => {
      const conflictError = new ConflictError(
        "Hard Duplicate Rejection: A client profile already exists with the given phone '+59170012345'.",
      );
      (clientApi.registerClient as jest.Mock).mockRejectedValue(conflictError);

      renderWithProviders(<ClientCreatePage />, {
        queryClient,
        initialRoute: '/clients/new',
        initialSessionOverride: mockStaffUser,
      });

      fireEvent.change(screen.getByTestId('first-name-input'), { target: { value: 'Carlos' } });
      fireEvent.change(screen.getByTestId('last-name-input'), { target: { value: 'Santana' } });
      fireEvent.change(screen.getByTestId('email-input'), {
        target: { value: 'carlos.santana@example.com' },
      });
      fireEvent.change(screen.getByTestId('phone-input'), { target: { value: '+59170012345' } });

      fireEvent.click(screen.getByTestId('submit-registration-button'));

      await waitFor(() => {
        expect(
          screen.getByText(/An active client with this phone number already exists/i),
        ).toBeInTheDocument();
      });

      expect(screen.getByTestId('phone-input')).toHaveValue('+59170012345');
    });

    it('handles soft duplicate warning: displays PotentialMatchesCard and allows bypass submission', async () => {
      const softDuplicatePayload = {
        status: 'POTENTIAL_DUPLICATES_FOUND',
        message: 'Soft duplicate warning: Potential matching client profiles were found.',
        potentialMatches: [
          {
            clientId: 'cli_existing_123',
            referenceNumber: 'CLI-2025-00100',
            fullName: 'Carlos Santana Sr.',
            email: 'carlos.sr@example.com',
            phone: '+59170012345',
            matchReason: 'EXACT_PHONE' as const,
          },
        ],
      };

      const softConflictError = new ConflictError(
        'Soft duplicate warning',
        undefined,
        softDuplicatePayload,
      );
      (clientApi.registerClient as jest.Mock).mockRejectedValueOnce(softConflictError);

      renderWithProviders(<ClientCreatePage />, {
        queryClient,
        initialRoute: '/clients/new',
        initialSessionOverride: mockStaffUser,
      });

      fireEvent.change(screen.getByTestId('first-name-input'), { target: { value: 'Carlos' } });
      fireEvent.change(screen.getByTestId('last-name-input'), { target: { value: 'Santana' } });
      fireEvent.change(screen.getByTestId('email-input'), {
        target: { value: 'carlos.jr@example.com' },
      });
      fireEvent.change(screen.getByTestId('phone-input'), { target: { value: '+59170012345' } });

      fireEvent.click(screen.getByTestId('submit-registration-button'));

      // 1. Soft duplicate warning card is rendered
      await waitFor(() => {
        expect(screen.getByTestId('potential-matches-card')).toBeInTheDocument();
      });

      expect(screen.getByText('Carlos Santana Sr.')).toBeInTheDocument();
      expect(screen.getByText('(CLI-2025-00100)')).toBeInTheDocument();
      expect(screen.getByText('Matching Phone')).toBeInTheDocument();

      // 2. Click "Proceed with Registration" to force creation with bypassSoftDuplicates=true
      (clientApi.registerClient as jest.Mock).mockResolvedValueOnce(sampleRegisteredClient);

      const bypassBtn = screen.getByTestId('bypass-duplicate-button');
      fireEvent.click(bypassBtn);

      await waitFor(() => {
        expect(clientApi.registerClient).toHaveBeenCalledWith(
          expect.objectContaining({
            bypassSoftDuplicates: true,
          }),
        );
      });
    });
  });

  describe('Recoverable Errors & Resilience', () => {
    it('displays recoverable alert on network failure and preserves form values', async () => {
      (clientApi.registerClient as jest.Mock).mockRejectedValue(
        new NetworkError('Network request failed.'),
      );

      renderWithProviders(<ClientCreatePage />, {
        queryClient,
        initialRoute: '/clients/new',
        initialSessionOverride: mockStaffUser,
      });

      fireEvent.change(screen.getByTestId('first-name-input'), { target: { value: 'Carlos' } });
      fireEvent.change(screen.getByTestId('last-name-input'), { target: { value: 'Santana' } });
      fireEvent.change(screen.getByTestId('email-input'), {
        target: { value: 'carlos@example.com' },
      });
      fireEvent.change(screen.getByTestId('phone-input'), { target: { value: '+59170012345' } });

      fireEvent.click(screen.getByTestId('submit-registration-button'));

      await waitFor(() => {
        expect(screen.getByText(/Registration Failed/i)).toBeInTheDocument();
      });

      // Values preserved
      expect(screen.getByTestId('first-name-input')).toHaveValue('Carlos');
      expect(screen.getByTestId('last-name-input')).toHaveValue('Santana');
      expect(screen.getByTestId('email-input')).toHaveValue('carlos@example.com');
      expect(screen.getByTestId('phone-input')).toHaveValue('+59170012345');
    });
  });

  describe('Accessibility & Markup Semantics', () => {
    it('provides accessible associations between required inputs and form labels', () => {
      renderWithProviders(<ClientCreatePage />, {
        queryClient,
        initialRoute: '/clients/new',
        initialSessionOverride: mockStaffUser,
      });

      const firstNameInput = screen.getByTestId('first-name-input');
      expect(firstNameInput).toHaveAttribute('aria-required', 'true');

      const emailInput = screen.getByTestId('email-input');
      expect(emailInput).toHaveAttribute('aria-required', 'true');

      const phoneInput = screen.getByTestId('phone-input');
      expect(phoneInput).toHaveAttribute('aria-required', 'true');
    });
  });
});
