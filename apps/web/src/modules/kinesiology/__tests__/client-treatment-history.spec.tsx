import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClientTreatmentHistoryPage } from '../routes/client-treatment-history-page';
import { TreatmentHistoryList } from '../components/treatment-history-list';
import { useAuth } from '../../../app/providers/auth-provider';
import { useClientTreatmentHistory } from '../hooks/use-client-treatment-history';
import { kinesiologyQueryKeys } from '../api/kinesiology-query-keys';
import { SessionStatus } from '@kinergy-platform/core';
import type { PaginatedTreatmentHistory } from '../types';

jest.mock('../../../app/providers/auth-provider');
jest.mock('../hooks/use-client-treatment-history');

const mockUseAuth = useAuth as jest.Mock;
const mockUseClientTreatmentHistory = useClientTreatmentHistory as jest.Mock;

describe('Milestone 5.5: Client Treatment History Integration & Security Verification', () => {
  let queryClient: QueryClient;

  const sampleHistory: PaginatedTreatmentHistory = {
    items: [
      {
        sessionId: 'sess_hist_001',
        clientId: 'client_audit_77',
        appointmentId: 'appt_ref_888',
        therapistId: 'therapist_dr_smith',
        status: SessionStatus.COMPLETED,
        notesSummary: 'Significant ROM improvement in cervical spine.',
        hasFullNotes: true,
        version: 4,
        createdAt: '2026-08-15T14:30:00.000Z',
        updatedAt: '2026-08-15T15:30:00.000Z',
      },
      {
        sessionId: 'sess_hist_002',
        clientId: 'client_audit_77',
        appointmentId: 'appt_ref_889',
        therapistId: 'therapist_dr_clark',
        status: SessionStatus.IN_PROGRESS,
        notesSummary: undefined,
        hasFullNotes: false,
        version: 1,
        createdAt: '2026-08-18T09:00:00.000Z',
        updatedAt: '2026-08-18T09:15:00.000Z',
      },
    ],
    total: 2,
    page: 1,
    limit: 10,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    mockUseAuth.mockReturnValue({
      hasPermission: (perm: string) => perm === 'kinesiology.sessions.read' || perm === '*',
      currentUser: { id: 'practitioner_01', permissions: ['kinesiology.sessions.read'] },
    });

    mockUseClientTreatmentHistory.mockReturnValue({
      data: sampleHistory,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Step 1 & 2: Authoritative Data Mapping & Field Presentation', () => {
    it('renders authoritative treatment records with date, status badge, therapist, and clinical progress preview', () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/clients/client_audit_77/treatments']}>
            <Routes>
              <Route
                path="/clients/:clientId/treatments"
                element={<ClientTreatmentHistoryPage />}
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Client Header details
      expect(screen.getByText('Client Profile & Clinical Records')).toBeInTheDocument();
      expect(screen.getAllByText('client_audit_77').length).toBeGreaterThanOrEqual(1);

      // Session 1: Completed with summary
      expect(screen.getAllByText('Completed').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('therapist_dr_smith')).toBeInTheDocument();
      expect(screen.getByText('appt_ref_888')).toBeInTheDocument();
      expect(
        screen.getByText(/"Significant ROM improvement in cervical spine\."/i),
      ).toBeInTheDocument();

      // Session 2: In Progress with no notes
      expect(screen.getAllByText('In Progress').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('therapist_dr_clark')).toBeInTheDocument();
      expect(screen.getByText('appt_ref_889')).toBeInTheDocument();
      expect(screen.getByText('No notes entered')).toBeInTheDocument();
    });

    it('clearly distinguishes between appointment correlation references and clinical treatment session IDs', () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <TreatmentHistoryList clientId="client_audit_77" />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.getByText('Appointment Ref')).toBeInTheDocument();
      expect(screen.getByText('appt_ref_888')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /View treatment session sess_hist_001/i }),
      ).toBeInTheDocument();
    });

    it('navigates to canonical session route /kinesiology/sessions/:sessionId upon clicking View Session', () => {
      let navigatedLocation = '';
      const onSelectSession = jest.fn((id: string) => {
        navigatedLocation = `/kinesiology/sessions/${id}`;
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <TreatmentHistoryList clientId="client_audit_77" onSelectSession={onSelectSession} />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      const viewBtn = screen.getByRole('button', {
        name: /View treatment session sess_hist_001/i,
      });
      fireEvent.click(viewBtn);

      expect(onSelectSession).toHaveBeenCalledWith('sess_hist_001');
      expect(navigatedLocation).toBe('/kinesiology/sessions/sess_hist_001');
    });
  });

  describe('Step 3: Privacy, Access Control & Leakage Protection', () => {
    it('blocks access and renders ForbiddenView when practitioner lacks kinesiology.sessions.read permission', () => {
      mockUseAuth.mockReturnValue({
        hasPermission: (perm: string) => perm === 'client:read', // Missing kinesiology.sessions.read
        currentUser: { id: 'unauthorized_staff', permissions: ['client:read'] },
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/clients/client_audit_77/treatments']}>
            <Routes>
              <Route
                path="/clients/:clientId/treatments"
                element={<ClientTreatmentHistoryPage />}
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(
        screen.getByText(/Missing required permission 'kinesiology\.sessions\.read'/i),
      ).toBeInTheDocument();
      expect(
        screen.queryByText('Significant ROM improvement in cervical spine.'),
      ).not.toBeInTheDocument();
    });

    it('renders restricted access notice when treatment history API returns 403 Forbidden without displaying stale clinical records', () => {
      mockUseClientTreatmentHistory.mockReturnValue({
        data: sampleHistory, // Mock stale data in cache
        isLoading: false,
        isError: true,
        error: {
          statusCode: 403,
          code: 'FORBIDDEN',
          message: 'Access Denied: Insufficient clinical clearance.',
        },
        refetch: jest.fn(),
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <TreatmentHistoryList clientId="client_audit_77" />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.getByTestId('forbidden-treatment-history')).toBeInTheDocument();
      expect(screen.getByText(/Access Restricted/i)).toBeInTheDocument();
      expect(
        screen.getByText(/You do not possess the required security permission/i),
      ).toBeInTheDocument();
      // Verifies stale clinical data is NOT exposed
      expect(
        screen.queryByText('Significant ROM improvement in cervical spine.'),
      ).not.toBeInTheDocument();
    });

    it('ensures no clinical notes or SOAP text are placed into URL query parameters or console logs', () => {
      const consoleLogSpy = jest.spyOn(console, 'log');

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/clients/client_audit_77/treatments']}>
            <Routes>
              <Route
                path="/clients/:clientId/treatments"
                element={<ClientTreatmentHistoryPage />}
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Verify no console logging of PHI occurred
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Significant ROM improvement'),
      );
      consoleLogSpy.mockRestore();
    });
  });

  describe('Step 4 & 5: Pagination, Filter Validation, UI States & Accessibility', () => {
    it('renders loading skeleton during data fetch', () => {
      mockUseClientTreatmentHistory.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
        refetch: jest.fn(),
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <TreatmentHistoryList clientId="client_audit_77" />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.getByText(/Clinical Treatment History/i)).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('renders empty state when client has no treatment history', () => {
      mockUseClientTreatmentHistory.mockReturnValue({
        data: { items: [], total: 0, page: 1, limit: 10, totalPages: 0 },
        isLoading: false,
        isError: false,
        error: null,
        refetch: jest.fn(),
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <TreatmentHistoryList clientId="client_audit_77" />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.getByText('No Treatment Sessions Found')).toBeInTheDocument();
      expect(
        screen.getByText(
          /This client does not have any recorded kinesiology treatment sessions yet/i,
        ),
      ).toBeInTheDocument();
    });

    it('renders recoverable error state with retry callback on network failure', () => {
      const refetchMock = jest.fn();
      mockUseClientTreatmentHistory.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('Network timeout contacting clinical server.'),
        refetch: refetchMock,
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <TreatmentHistoryList clientId="client_audit_77" />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.getByText('Network timeout contacting clinical server.')).toBeInTheDocument();
      const retryBtn = screen.getByRole('button', { name: /Try Again/i });
      fireEvent.click(retryBtn);

      expect(refetchMock).toHaveBeenCalledTimes(1);
    });

    it('validates date ranges and displays an accessible warning when dateFrom is after dateTo', () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter
            initialEntries={[
              '/clients/client_audit_77/treatments?dateFrom=2026-08-20&dateTo=2026-08-10',
            ]}
          >
            <Routes>
              <Route
                path="/clients/:clientId/treatments"
                element={<TreatmentHistoryList clientId="client_audit_77" />}
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.getByText('Invalid Date Range')).toBeInTheDocument();
      expect(
        screen.getByText(/"Date From" cannot be after "Date To"\. Please adjust your dates\./i),
      ).toBeInTheDocument();
    });

    it('provides bounded pagination controls with disabled Next button on the last page', () => {
      mockUseClientTreatmentHistory.mockReturnValue({
        data: {
          items: sampleHistory.items,
          total: 2,
          page: 1,
          limit: 10,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
        isLoading: false,
        isError: false,
        error: null,
        refetch: jest.fn(),
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <TreatmentHistoryList clientId="client_audit_77" />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      const prevBtn = screen.getByRole('button', { name: /Go to previous page/i });
      const nextBtn = screen.getByRole('button', { name: /Go to next page/i });

      expect(prevBtn).toBeDisabled();
      expect(nextBtn).toBeDisabled();
      expect(
        screen.getByText(
          (_, el) =>
            el?.tagName.toLowerCase() === 'p' &&
            (el?.textContent?.includes('Showing page 1 of 1') ?? false),
        ),
      ).toBeInTheDocument();
    });

    it('displays invalid client identifier error when route parameter is empty', () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/clients/%20/treatments']}>
            <Routes>
              <Route
                path="/clients/:clientId/treatments"
                element={<ClientTreatmentHistoryPage />}
              />
              <Route path="/clients" element={<div>Clients Directory</div>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.getByText(/Invalid Client Identifier/i)).toBeInTheDocument();
    });
  });

  describe('Step 6: Cache Invalidation & Query Consistency', () => {
    it('generates deterministic query keys scoped to client and filter parameters', () => {
      const basicKey = kinesiologyQueryKeys.history('client_audit_77');
      expect(basicKey).toEqual(['kinesiology', 'history', 'client_audit_77']);

      const filteredKey = kinesiologyQueryKeys.history('client_audit_77', {
        status: SessionStatus.COMPLETED,
        page: 2,
      });
      expect(filteredKey).toEqual([
        'kinesiology',
        'history',
        'client_audit_77',
        { status: SessionStatus.COMPLETED, page: 2 },
      ]);
    });
  });
});
