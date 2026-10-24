import '@testing-library/jest-dom';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { Route, Routes } from 'react-router-dom';
import { ClientDetailPage } from '../routes/client-detail-page';
import { clientApi } from '../api/client-api';
import { clientTimelineApi } from '../api/client-timeline-api';
import { renderWithProviders } from '../../../test/test-utils';
import type { AuthUser } from '../../auth/domain/auth-state.types';
import type { ClientModel } from '../types/client.types';
import type { PaginatedClientTimeline } from '../types/client-timeline.types';

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

jest.mock('../api/client-timeline-api', () => ({
  clientTimelineApi: {
    getClientTimeline: jest.fn(),
  },
}));

const mockFullStaffUser: AuthUser = {
  id: 'usr_staff_full',
  email: 'staff@kinergy.test',
  name: 'Full Staff Practitioner',
  roles: ['Staff'],
  permissions: [
    'client:read',
    'client:write',
    'kinesiology.sessions.read',
    'memberships.read',
    'sales.read',
  ],
  tenantId: 'tenant_1',
};

const mockReadOnlyClientUser: AuthUser = {
  id: 'usr_readonly',
  email: 'readonly@kinergy.test',
  name: 'Read Only Auditor',
  roles: ['Auditor'],
  permissions: ['client:read'],
  tenantId: 'tenant_1',
};

const mockUnauthorizedUser: AuthUser = {
  id: 'usr_no_access',
  email: 'noaccess@kinergy.test',
  name: 'No Access User',
  roles: ['Guest'],
  permissions: [],
  tenantId: 'tenant_1',
};

const sampleActiveClient: ClientModel = {
  id: 'cli_01j9876543210abcdef11111',
  referenceNumber: 'CLI-2026-0001',
  firstName: 'Elena',
  lastName: 'Rostova',
  fullName: 'Elena Rostova',
  email: 'elena.rostova@example.com',
  phone: '+59171234567',
  status: 'ACTIVE',
  version: 3,
  identityId: 'usr_identity_999',
  createdAt: '2026-06-15T10:00:00.000Z',
  updatedAt: '2026-09-20T14:30:00.000Z',
};

const sampleArchivedClient: ClientModel = {
  id: 'cli_01j9876543210abcdef22222',
  referenceNumber: 'CLI-2026-0002',
  firstName: 'Marcus',
  lastName: 'Vance',
  fullName: 'Marcus Vance',
  email: 'marcus.vance@example.com',
  phone: '+59179876543',
  status: 'ARCHIVED',
  version: 5,
  identityId: null,
  createdAt: '2026-01-10T08:00:00.000Z',
  updatedAt: '2026-08-01T12:00:00.000Z',
};

const sampleTimelineData: PaginatedClientTimeline = {
  items: [
    {
      id: 'timeline_entry_1',
      clientId: sampleActiveClient.id,
      sourceModule: 'kinesiology',
      eventType: 'TreatmentSessionCompleted',
      summary: 'Kinesiology session: Lumbar stabilization therapy completed.',
      metadata: {
        sessionId: 'sess_kine_777',
        therapistId: 'therapist_dr_smith',
        appointmentId: 'appt_888',
      },
      occurredAt: '2026-09-15T15:00:00.000Z',
    },
    {
      id: 'timeline_entry_2',
      clientId: sampleActiveClient.id,
      sourceModule: 'client',
      eventType: 'CLIENT_CREATED',
      summary: 'Client profile registered in platform directory.',
      metadata: {},
      occurredAt: '2026-06-15T10:00:00.000Z',
    },
  ],
  total: 2,
  page: 1,
  limit: 10,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};

describe('Client Profile and Activity Timeline (/clients/:clientId)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    (clientTimelineApi.getClientTimeline as jest.Mock).mockResolvedValue(sampleTimelineData);
  });

  const renderProfilePage = (
    clientId = sampleActiveClient.id,
    authUser: AuthUser = mockFullStaffUser,
  ) => {
    return renderWithProviders(
      <Routes>
        <Route path="/clients/:clientId" element={<ClientDetailPage />} />
        <Route path="/clients" element={<div>Clients Directory Page</div>} />
        <Route path="/clients/:clientId/treatments" element={<div>Treatments Page</div>} />
        <Route path="/clients/:clientId/timeline" element={<div>Timeline Full Page</div>} />
      </Routes>,
      {
        queryClient,
        initialSessionOverride: authUser,
        initialEntries: [`/clients/${clientId}`],
      },
    );
  };

  describe('Step 1: Access Control & Authorization', () => {
    it('renders 403 ForbiddenView when user lacks client:read permission', async () => {
      renderProfilePage(sampleActiveClient.id, mockUnauthorizedUser);

      expect(
        await screen.findByText(/Missing required permission 'client:read'/i),
      ).toBeInTheDocument();
      expect(clientApi.getClientProfile).not.toHaveBeenCalled();
    });

    it('renders profile when user possesses client:read permission', async () => {
      (clientApi.getClientProfile as jest.Mock).mockResolvedValue(sampleActiveClient);

      renderProfilePage(sampleActiveClient.id, mockReadOnlyClientUser);

      expect(await screen.findByText('Elena Rostova')).toBeInTheDocument();
      expect(clientApi.getClientProfile).toHaveBeenCalledWith(sampleActiveClient.id);
    });

    it('renders permission-aware Edit and Archive action triggers for staff with client:write', async () => {
      (clientApi.getClientProfile as jest.Mock).mockResolvedValue(sampleActiveClient);

      renderProfilePage(sampleActiveClient.id, mockFullStaffUser);

      expect(await screen.findByTestId('edit-client-button')).toBeInTheDocument();
      expect(screen.getByTestId('archive-toggle-button')).toBeInTheDocument();
    });

    it('hides Edit and Archive triggers when user has read-only access', async () => {
      (clientApi.getClientProfile as jest.Mock).mockResolvedValue(sampleActiveClient);

      renderProfilePage(sampleActiveClient.id, mockReadOnlyClientUser);

      await screen.findByText('Elena Rostova');
      expect(screen.queryByTestId('edit-client-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('archive-toggle-button')).not.toBeInTheDocument();
    });
  });

  describe('Step 2: Profile Retrieval & Information Architecture', () => {
    it('renders populated profile fields matching domain contract', async () => {
      (clientApi.getClientProfile as jest.Mock).mockResolvedValue(sampleActiveClient);

      renderProfilePage(sampleActiveClient.id, mockFullStaffUser);

      // Full Name & Reference
      expect(await screen.findByText('Elena Rostova')).toBeInTheDocument();
      expect(screen.getAllByText('CLI-2026-0001').length).toBeGreaterThanOrEqual(1);

      // Status Badge
      expect(screen.getByLabelText('Client status: Active')).toBeInTheDocument();

      // Contact details
      expect(screen.getByTestId('client-first-name')).toHaveTextContent('Elena');
      expect(screen.getByTestId('client-last-name')).toHaveTextContent('Rostova');
      expect(screen.getByTestId('client-email')).toHaveTextContent('elena.rostova@example.com');
      expect(screen.getByTestId('client-email')).toHaveAttribute(
        'href',
        'mailto:elena.rostova@example.com',
      );
      expect(screen.getByTestId('client-phone')).toHaveTextContent('+59171234567');
      expect(screen.getByTestId('client-phone')).toHaveAttribute('href', 'tel:+59171234567');

      // Audit metadata
      expect(screen.getByTestId('client-ref-num')).toHaveTextContent('CLI-2026-0001');
      expect(screen.getByText('v3')).toBeInTheDocument();
      expect(screen.getByTestId('client-created-at')).not.toHaveTextContent('—');
      expect(screen.getByTestId('client-updated-at')).not.toHaveTextContent('—');
    });

    it('renders graceful fallback for optional fields (e.g. unlinked identity account)', async () => {
      (clientApi.getClientProfile as jest.Mock).mockResolvedValue(sampleArchivedClient);

      renderProfilePage(sampleArchivedClient.id, mockFullStaffUser);

      expect(await screen.findByText('Marcus Vance')).toBeInTheDocument();
      expect(screen.getByTestId('client-identity-unlinked')).toHaveTextContent(
        'Not linked to user account',
      );
    });

    it('renders linked identity account UUID when identityId is present', async () => {
      (clientApi.getClientProfile as jest.Mock).mockResolvedValue(sampleActiveClient);

      renderProfilePage(sampleActiveClient.id, mockFullStaffUser);

      expect(await screen.findByText('usr_identity_999')).toBeInTheDocument();
    });
  });

  describe('Step 3: Lifecycle States & Archived Handling', () => {
    it('renders archived alert banner and archived badge for ARCHIVED client', async () => {
      (clientApi.getClientProfile as jest.Mock).mockResolvedValue(sampleArchivedClient);

      renderProfilePage(sampleArchivedClient.id, mockFullStaffUser);

      expect(await screen.findByText(/Archived Client Profile/i)).toBeInTheDocument();
      expect(screen.getByLabelText('Client status: Archived')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Restore client profile/i })).toBeInTheDocument();
    });

    it('displays informative planned milestone notice when edit or archive action is clicked', async () => {
      (clientApi.getClientProfile as jest.Mock).mockResolvedValue(sampleActiveClient);

      renderProfilePage(sampleActiveClient.id, mockFullStaffUser);

      const editBtn = await screen.findByTestId('edit-client-button');
      fireEvent.click(editBtn);

      expect(
        await screen.findByText(/Client profile editing will be implemented in Milestone 3.3/i),
      ).toBeInTheDocument();

      const archiveBtn = screen.getByTestId('archive-toggle-button');
      fireEvent.click(archiveBtn);

      expect(
        await screen.findByText(/Client profile archiving will be implemented in Milestone 3.4/i),
      ).toBeInTheDocument();
    });
  });

  describe('Step 4: Missing Client & API Failure Recovery', () => {
    it('renders 404 Client Not Found state when client does not exist', async () => {
      const notFoundError = new Error('Client with ID not found');
      (notFoundError as unknown as { status: number }).status = 404;
      (clientApi.getClientProfile as jest.Mock).mockRejectedValue(notFoundError);

      renderProfilePage('cli_nonexistent', mockFullStaffUser);

      expect(await screen.findByText(/Client Not Found/i)).toBeInTheDocument();
      expect(
        screen.getByText(/The client profile for ID "cli_nonexistent" could not be located/i),
      ).toBeInTheDocument();

      const backBtn = screen.getByRole('button', { name: /Back to Directory/i });
      expect(backBtn).toBeInTheDocument();
    });

    it('renders recoverable error state with retry on network failure', async () => {
      const networkError = new Error('Gateway Connection Timeout (504)');
      (clientApi.getClientProfile as jest.Mock).mockRejectedValue(networkError);

      renderProfilePage(sampleActiveClient.id, mockFullStaffUser);

      expect(await screen.findByText(/Failed to Load Client Profile/i)).toBeInTheDocument();
      expect(screen.getByText('Gateway Connection Timeout (504)')).toBeInTheDocument();

      const retryBtn = screen.getByRole('button', { name: /Retry/i });
      expect(retryBtn).toBeInTheDocument();

      // Simulate recovery
      (clientApi.getClientProfile as jest.Mock).mockResolvedValue(sampleActiveClient);
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(screen.getByText('Elena Rostova')).toBeInTheDocument();
      });
    });
  });

  describe('Step 5: Cross-Domain Feature Entry Points', () => {
    it('renders active entry points to treatment, gym, and sales when user has permissions', async () => {
      (clientApi.getClientProfile as jest.Mock).mockResolvedValue(sampleActiveClient);

      renderProfilePage(sampleActiveClient.id, mockFullStaffUser);

      await screen.findByText('Elena Rostova');

      // Clinical treatment link
      const treatmentLink = screen.getByTestId('link-treatment-history');
      expect(treatmentLink).toHaveAttribute(
        'href',
        `/clients/${encodeURIComponent(sampleActiveClient.id)}/treatments`,
      );

      // Gym memberships link
      const gymLink = screen.getByTestId('link-gym-memberships');
      expect(gymLink).toHaveAttribute(
        'href',
        `/gym/memberships?clientId=${encodeURIComponent(sampleActiveClient.id)}`,
      );

      // Commercial sales link
      const salesLink = screen.getByTestId('link-commercial-sales');
      expect(salesLink).toHaveAttribute(
        'href',
        `/sales/list?clientId=${encodeURIComponent(sampleActiveClient.id)}`,
      );
    });

    it('renders locked notices for entry points where user lacks permission', async () => {
      (clientApi.getClientProfile as jest.Mock).mockResolvedValue(sampleActiveClient);

      renderProfilePage(sampleActiveClient.id, mockReadOnlyClientUser);

      await screen.findByText('Elena Rostova');

      expect(screen.getByTestId('locked-treatment-history')).toHaveTextContent(
        'Requires kinesiology.sessions.read',
      );
      expect(screen.getByTestId('locked-gym-memberships')).toHaveTextContent(
        'Requires memberships.read',
      );
      expect(screen.getByTestId('locked-commercial-sales')).toHaveTextContent(
        'Requires sales.read',
      );
    });
  });

  describe('Step 6: Longitudinal Activity Timeline Integration & Failure Isolation', () => {
    it('renders longitudinal timeline events embedded on profile page', async () => {
      (clientApi.getClientProfile as jest.Mock).mockResolvedValue(sampleActiveClient);

      renderProfilePage(sampleActiveClient.id, mockFullStaffUser);

      expect(await screen.findByText(/Longitudinal Activity Timeline/i)).toBeInTheDocument();
      expect(await screen.findByText('Treatment Session Completed')).toBeInTheDocument();
      expect(screen.getByText('Client Profile Created')).toBeInTheDocument();
      expect(
        screen.getByText('Kinesiology session: Lumbar stabilization therapy completed.'),
      ).toBeInTheDocument();

      // CTA to view treatment session
      expect(
        screen.getByRole('button', { name: /View treatment session sess_kine_777/i }),
      ).toBeInTheDocument();
    });

    it('preserves profile information usability when timeline query encounters an error (fault isolation)', async () => {
      (clientApi.getClientProfile as jest.Mock).mockResolvedValue(sampleActiveClient);
      (clientTimelineApi.getClientTimeline as jest.Mock).mockRejectedValue(
        new Error('Timeline service unavailable'),
      );

      renderProfilePage(sampleActiveClient.id, mockFullStaffUser);

      // Profile details remain fully loaded and interactive
      expect(await screen.findByText('Elena Rostova')).toBeInTheDocument();
      expect(screen.getByTestId('client-email')).toHaveTextContent('elena.rostova@example.com');
      expect(screen.getByTestId('client-phone')).toHaveTextContent('+59171234567');

      // Timeline shows its own isolated error with retry button
      expect(await screen.findByText('Timeline service unavailable')).toBeInTheDocument();
    });
  });

  describe('Step 7: Navigation & Sub-Route Tabs', () => {
    it('renders tabs linking to Overview, Activity Timeline, and Treatment History', async () => {
      (clientApi.getClientProfile as jest.Mock).mockResolvedValue(sampleActiveClient);

      renderProfilePage(sampleActiveClient.id, mockFullStaffUser);

      await screen.findByText('Elena Rostova');

      const overviewTab = screen.getByRole('link', { name: /^Overview$/i });
      const timelineTab = screen.getByRole('link', { name: /^Activity Timeline$/i });
      const treatmentTab = screen.getByRole('link', { name: /^Treatment History$/i });

      expect(overviewTab).toHaveAttribute('href', `/clients/${sampleActiveClient.id}`);
      expect(timelineTab).toHaveAttribute('href', `/clients/${sampleActiveClient.id}/timeline`);
      expect(treatmentTab).toHaveAttribute('href', `/clients/${sampleActiveClient.id}/treatments`);
    });

    it('navigates back to /clients directory when back button is clicked', async () => {
      (clientApi.getClientProfile as jest.Mock).mockResolvedValue(sampleActiveClient);

      renderProfilePage(sampleActiveClient.id, mockFullStaffUser);

      const backBtn = await screen.findByRole('button', { name: /Back to client directory/i });
      fireEvent.click(backBtn);

      expect(await screen.findByText('Clients Directory Page')).toBeInTheDocument();
    });
  });
});
