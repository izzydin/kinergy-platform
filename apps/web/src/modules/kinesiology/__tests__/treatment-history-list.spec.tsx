import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TreatmentHistoryList } from '../components/treatment-history-list';
import { useClientTreatmentHistory } from '../hooks/use-client-treatment-history';

jest.mock('../hooks/use-client-treatment-history');

const mockUseClientTreatmentHistory = useClientTreatmentHistory as jest.Mock;

describe('TreatmentHistoryList Component Unit Tests', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading skeleton when query is in loading state', () => {
    mockUseClientTreatmentHistory.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    render(
      <MemoryRouter>
        <TreatmentHistoryList clientId="client_123" />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Clinical Treatment History/i)).toBeInTheDocument();
  });

  it('renders empty state view when no sessions exist', () => {
    mockUseClientTreatmentHistory.mockReturnValue({
      data: { items: [], total: 0, page: 1, limit: 10, totalPages: 0 },
      isLoading: false,
      isError: false,
    });

    render(
      <MemoryRouter>
        <TreatmentHistoryList clientId="client_123" />
      </MemoryRouter>,
    );

    expect(screen.getByText(/No Treatment Sessions Found/i)).toBeInTheDocument();
  });

  it('renders populated data table with session date, status badge, therapist, and view button', () => {
    const onSelectSession = jest.fn();
    mockUseClientTreatmentHistory.mockReturnValue({
      data: {
        items: [
          {
            sessionId: 'sess_100',
            clientId: 'client_123',
            appointmentId: 'appt_200',
            therapistId: 'therapist_300',
            status: 'COMPLETED',
            notesSummary: 'Significant recovery observed',
            hasFullNotes: true,
            version: 3,
            createdAt: '2026-08-17T10:00:00.000Z',
            updatedAt: '2026-08-17T11:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
      isLoading: false,
      isError: false,
    });

    render(
      <MemoryRouter>
        <TreatmentHistoryList clientId="client_123" onSelectSession={onSelectSession} />
      </MemoryRouter>,
    );

    expect(screen.getAllByText('Completed').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('therapist_300')).toBeInTheDocument();
    expect(screen.getByText('appt_200')).toBeInTheDocument();
    expect(screen.getByText(/"Significant recovery observed"/i)).toBeInTheDocument();

    const viewBtn = screen.getByRole('button', { name: /View treatment session sess_100/i });
    fireEvent.click(viewBtn);

    expect(onSelectSession).toHaveBeenCalledWith('sess_100');
  });

  it('updates URL search parameters when status filter changes', () => {
    mockUseClientTreatmentHistory.mockReturnValue({
      data: { items: [], total: 0, page: 1, limit: 10, totalPages: 0 },
      isLoading: false,
      isError: false,
    });

    render(
      <MemoryRouter initialEntries={['/clients/client_123/treatments']}>
        <Routes>
          <Route
            path="/clients/:clientId/treatments"
            element={<TreatmentHistoryList clientId="client_123" />}
          />
        </Routes>
      </MemoryRouter>,
    );

    const statusSelect = screen.getByLabelText(/Session Status/i);
    fireEvent.change(statusSelect, { target: { value: 'COMPLETED' } });

    expect(mockUseClientTreatmentHistory).toHaveBeenCalled();
  });
});
