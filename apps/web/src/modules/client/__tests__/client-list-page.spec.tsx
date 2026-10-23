import '@testing-library/jest-dom';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { ClientListPage } from '../routes/client-list-page';
import { clientApi } from '../api/client-api';
import { renderWithProviders } from '../../../test/test-utils';
import type { ClientModel, PaginatedClientsDTO } from '../types/client.types';
import type { AuthUser } from '../../auth/domain/auth-state.types';

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
  email: 'practitioner@kinergy.test',
  name: 'Dr. Practitioner',
  roles: ['Practitioner'],
  permissions: ['client:read'],
  tenantId: 'tenant_1',
};

const mockUnauthorizedUser: AuthUser = {
  id: 'usr_unauth_1',
  email: 'guest@kinergy.test',
  name: 'Guest',
  roles: ['Guest'],
  permissions: [],
  tenantId: 'tenant_1',
};

const mockClient1: ClientModel = {
  id: 'cli_01j9876543210abcdef00001',
  referenceNumber: 'CL-2026-0001',
  firstName: 'Jane',
  lastName: 'Doe',
  fullName: 'Jane Doe',
  email: 'jane.doe@example.com',
  phone: '+15551234567',
  status: 'ACTIVE',
  version: 1,
  createdAt: '2026-10-15T14:30:00.000Z',
  updatedAt: '2026-10-15T14:35:00.000Z',
  identityId: 'usr_identity_01',
};

const mockClient2: ClientModel = {
  id: 'cli_01j9876543210abcdef00002',
  referenceNumber: 'CL-2026-0002',
  firstName: 'John',
  lastName: 'Smith',
  fullName: 'John Smith',
  email: 'john.smith@example.com',
  phone: '+15559876543',
  status: 'ARCHIVED',
  version: 2,
  createdAt: '2026-10-16T09:15:00.000Z',
  updatedAt: '2026-10-18T10:00:00.000Z',
  identityId: null,
};

const samplePaginatedResponse: PaginatedClientsDTO = {
  items: [mockClient1, mockClient2],
  total: 2,
  page: 1,
  limit: 10,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};

describe('ClientListPage Component & Integration Contract', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
  });

  describe('Authorization & Permissions', () => {
    it('renders 403 ForbiddenView when user lacks client:read permission', () => {
      renderWithProviders(<ClientListPage />, {
        queryClient,
        initialRoute: '/clients',
        initialSessionOverride: mockUnauthorizedUser,
      });

      expect(
        screen.getByText(/Access Denied: Missing required permission 'client:read'/i),
      ).toBeInTheDocument();
      expect(clientApi.searchClients).not.toHaveBeenCalled();
    });

    it('renders "Create Client" button when user has client:write permission', async () => {
      (clientApi.searchClients as jest.Mock).mockResolvedValue(samplePaginatedResponse);

      renderWithProviders(<ClientListPage />, {
        queryClient,
        initialRoute: '/clients',
        initialSessionOverride: mockStaffUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('header-create-client-button')).toBeInTheDocument();
      });
      expect(screen.getByTestId('create-client-button')).toBeInTheDocument();
    });

    it('hides "Create Client" button when user has only client:read permission', async () => {
      (clientApi.searchClients as jest.Mock).mockResolvedValue(samplePaginatedResponse);

      renderWithProviders(<ClientListPage />, {
        queryClient,
        initialRoute: '/clients',
        initialSessionOverride: mockReadOnlyUser,
      });

      await waitFor(() => {
        expect(screen.getByText('Jane Doe')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('header-create-client-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('create-client-button')).not.toBeInTheDocument();
    });

    it('invokes onCreateClient callback when Create Client button is clicked', async () => {
      (clientApi.searchClients as jest.Mock).mockResolvedValue(samplePaginatedResponse);
      const handleCreate = jest.fn();

      renderWithProviders(<ClientListPage onCreateClient={handleCreate} />, {
        queryClient,
        initialRoute: '/clients',
        initialSessionOverride: mockStaffUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('header-create-client-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('header-create-client-button'));
      expect(handleCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe('UI States (Loading, Populated, Empty, Error)', () => {
    it('displays loading skeleton indicator while query is pending', () => {
      // Pending promise that does not resolve immediately
      (clientApi.searchClients as jest.Mock).mockReturnValue(new Promise(() => {}));

      renderWithProviders(<ClientListPage />, {
        queryClient,
        initialRoute: '/clients',
        initialSessionOverride: mockStaffUser,
      });

      // The table skeleton container is rendered with aria-label
      expect(screen.getByLabelText('Loading table data')).toBeInTheDocument();
    });

    it('renders populated directory table with real client DTO records', async () => {
      (clientApi.searchClients as jest.Mock).mockResolvedValue(samplePaginatedResponse);

      renderWithProviders(<ClientListPage />, {
        queryClient,
        initialRoute: '/clients',
        initialSessionOverride: mockStaffUser,
      });

      await waitFor(() => {
        expect(screen.getByText('Jane Doe')).toBeInTheDocument();
      });

      // Verify column headers
      expect(screen.getByRole('columnheader', { name: /Reference #/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sort by client name/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /Email/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /Phone/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /Status/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sort by created/i })).toBeInTheDocument();

      // Verify row items rendered
      expect(screen.getByTestId(`client-ref-${mockClient1.id}`)).toHaveTextContent('CL-2026-0001');
      expect(screen.getByTestId(`client-name-${mockClient1.id}`)).toHaveTextContent('Jane Doe');
      expect(screen.getByRole('link', { name: 'jane.doe@example.com' })).toBeInTheDocument();
      expect(screen.getByText('+15551234567')).toBeInTheDocument();
      expect(screen.getByLabelText('Client status: Active')).toBeInTheDocument();

      expect(screen.getByTestId(`client-ref-${mockClient2.id}`)).toHaveTextContent('CL-2026-0002');
      expect(screen.getByTestId(`client-name-${mockClient2.id}`)).toHaveTextContent('John Smith');
      expect(screen.getByRole('link', { name: 'john.smith@example.com' })).toBeInTheDocument();
      expect(screen.getByText('+15559876543')).toBeInTheDocument();
      expect(screen.getByLabelText('Client status: Archived')).toBeInTheDocument();

      // View profile action links
      const viewBtn1 = screen.getByTestId(`view-client-${mockClient1.id}`);
      expect(viewBtn1).toHaveAttribute('href', `/clients/${mockClient1.id}`);

      const viewBtn2 = screen.getByTestId(`view-client-${mockClient2.id}`);
      expect(viewBtn2).toHaveAttribute('href', `/clients/${mockClient2.id}`);
    });

    it('renders total empty state when no clients exist in directory', async () => {
      (clientApi.searchClients as jest.Mock).mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      renderWithProviders(<ClientListPage />, {
        queryClient,
        initialRoute: '/clients',
        initialSessionOverride: mockStaffUser,
      });

      await waitFor(() => {
        expect(screen.getByText(/No clients registered yet/i)).toBeInTheDocument();
      });

      expect(
        screen.getByText(/Get started by creating your first client record in the platform/i),
      ).toBeInTheDocument();
      expect(screen.getByTestId('empty-create-client-button')).toBeInTheDocument();
    });

    it('renders filtered empty state with reset filters button when search returns 0 results', async () => {
      (clientApi.searchClients as jest.Mock).mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      renderWithProviders(<ClientListPage />, {
        queryClient,
        initialRoute: '/clients?q=NonExistent',
        initialSessionOverride: mockStaffUser,
      });

      await waitFor(() => {
        expect(screen.getByText(/No clients found/i)).toBeInTheDocument();
      });

      expect(
        screen.getByText(/No client profiles match your current search and filter criteria/i),
      ).toBeInTheDocument();

      // Reset filters button is present
      const resetButtons = screen.getAllByRole('button', { name: /reset/i });
      expect(resetButtons.length).toBeGreaterThan(0);
    });

    it('renders error state with retry button on network failure', async () => {
      (clientApi.searchClients as jest.Mock).mockRejectedValue(
        new Error('Network connection failure'),
      );

      renderWithProviders(<ClientListPage />, {
        queryClient,
        initialRoute: '/clients',
        initialSessionOverride: mockStaffUser,
      });

      await waitFor(() => {
        expect(screen.getByText(/Failed to load data/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/Network connection failure/i)).toBeInTheDocument();
      const retryBtn = screen.getByRole('button', { name: /retry/i });
      expect(retryBtn).toBeInTheDocument();

      // Clicking retry triggers refetch
      (clientApi.searchClients as jest.Mock).mockResolvedValueOnce(samplePaginatedResponse);
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(clientApi.searchClients).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('URL-Driven Search, Filters, Sorting, and Pagination', () => {
    it('hydrates initial parameters from URL', async () => {
      (clientApi.searchClients as jest.Mock).mockResolvedValue(samplePaginatedResponse);

      renderWithProviders(<ClientListPage />, {
        queryClient,
        initialRoute: '/clients?q=Jane&status=ACTIVE&page=2&limit=20&sort=name.asc',
        initialSessionOverride: mockStaffUser,
      });

      await waitFor(() => {
        expect(clientApi.searchClients).toHaveBeenCalledWith(
          expect.objectContaining({
            query: 'Jane',
            q: 'Jane',
            status: 'ACTIVE',
            page: 2,
            limit: 20,
            sortBy: 'name',
            sortOrder: 'ASC',
          }),
        );
      });

      const searchInput = screen.getByRole('searchbox');
      expect(searchInput).toHaveValue('Jane');
    });

    it('normalizes invalid parameters safely without crashing', async () => {
      (clientApi.searchClients as jest.Mock).mockResolvedValue(samplePaginatedResponse);

      renderWithProviders(<ClientListPage />, {
        queryClient,
        initialRoute: '/clients?status=INVALID_STATUS&limit=999&page=-5&sort=malicious_sql',
        initialSessionOverride: mockStaffUser,
      });

      await waitFor(() => {
        expect(clientApi.searchClients).toHaveBeenCalledWith(
          expect.objectContaining({
            status: undefined,
            limit: 10,
            page: 1,
            sortBy: 'createdAt',
            sortOrder: 'DESC',
          }),
        );
      });
    });

    it('triggers search when user types into search box', async () => {
      (clientApi.searchClients as jest.Mock).mockResolvedValue(samplePaginatedResponse);

      renderWithProviders(<ClientListPage />, {
        queryClient,
        initialRoute: '/clients',
        initialSessionOverride: mockStaffUser,
      });

      await waitFor(() => {
        expect(screen.getByText('Jane Doe')).toBeInTheDocument();
      });

      const searchInput = screen.getByRole('searchbox');
      fireEvent.change(searchInput, { target: { value: 'Smith' } });

      await waitFor(
        () => {
          expect(clientApi.searchClients).toHaveBeenCalledWith(
            expect.objectContaining({
              query: 'Smith',
              page: 1,
            }),
          );
        },
        { timeout: 1500 },
      );
    });

    it('resets filters when Reset button is clicked', async () => {
      (clientApi.searchClients as jest.Mock).mockResolvedValue(samplePaginatedResponse);

      renderWithProviders(<ClientListPage />, {
        queryClient,
        initialRoute: '/clients?q=TestFilter&status=ACTIVE',
        initialSessionOverride: mockStaffUser,
      });

      await waitFor(() => {
        expect(clientApi.searchClients).toHaveBeenCalled();
      });

      // Find toolbar reset button
      const resetBtn = screen.getByRole('button', { name: /reset/i });
      fireEvent.click(resetBtn);

      await waitFor(() => {
        expect(clientApi.searchClients).toHaveBeenCalledWith(
          expect.objectContaining({
            query: undefined,
            status: undefined,
            page: 1,
          }),
        );
      });
    });

    it('changes sort order when column header is clicked', async () => {
      (clientApi.searchClients as jest.Mock).mockResolvedValue(samplePaginatedResponse);

      renderWithProviders(<ClientListPage />, {
        queryClient,
        initialRoute: '/clients',
        initialSessionOverride: mockStaffUser,
      });

      await waitFor(() => {
        expect(screen.getByText('Jane Doe')).toBeInTheDocument();
      });

      const sortNameBtn = screen.getByRole('button', { name: /sort by client name/i });
      fireEvent.click(sortNameBtn);

      await waitFor(() => {
        expect(clientApi.searchClients).toHaveBeenCalledWith(
          expect.objectContaining({
            sortBy: 'name',
            page: 1,
          }),
        );
      });
    });
  });

  describe('Accessibility and Semantic HTML', () => {
    it('renders accessible semantic table markup with aria labels', async () => {
      (clientApi.searchClients as jest.Mock).mockResolvedValue(samplePaginatedResponse);

      renderWithProviders(<ClientListPage />, {
        queryClient,
        initialRoute: '/clients',
        initialSessionOverride: mockStaffUser,
      });

      await waitFor(() => {
        expect(screen.getByRole('table', { name: /Clients directory table/i })).toBeInTheDocument();
      });

      expect(
        screen.getByRole('searchbox', { name: /Search client profiles/i }),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Filter by Status/i })).toBeInTheDocument();
    });
  });
});
