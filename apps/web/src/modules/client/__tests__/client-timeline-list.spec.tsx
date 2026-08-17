import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ClientTimelineList } from '../components/client-timeline-list';
import { useClientTimeline } from '../hooks/use-client-timeline';

jest.mock('../hooks/use-client-timeline');

const mockUseClientTimeline = useClientTimeline as jest.Mock;

describe('ClientTimelineList Cross-Context Read Model Spec', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading state when timeline query is loading', () => {
    mockUseClientTimeline.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    render(
      <MemoryRouter>
        <ClientTimelineList clientId="client_123" />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Longitudinal Activity Timeline/i)).toBeInTheDocument();
  });

  it('renders empty timeline view without treating it as treatment failure (eventual consistency)', () => {
    mockUseClientTimeline.mockReturnValue({
      data: { items: [], total: 0, page: 1, limit: 10, totalPages: 0 },
      isLoading: false,
      isError: false,
    });

    render(
      <MemoryRouter>
        <ClientTimelineList clientId="client_123" />
      </MemoryRouter>,
    );

    expect(screen.getByText(/No Activity Timeline Entries/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        /No events or completed treatment sessions have been projected for this client yet./i,
      ),
    ).toBeInTheDocument();
  });

  it('renders error state with retry button on query failure', () => {
    const refetch = jest.fn();
    mockUseClientTimeline.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network timeout'),
      refetch,
    });

    render(
      <MemoryRouter>
        <ClientTimelineList clientId="client_123" />
      </MemoryRouter>,
    );

    expect(screen.getByText('Network timeout')).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: /Try Again/i });
    fireEvent.click(retryBtn);
    expect(refetch).toHaveBeenCalled();
  });

  it('renders projected Treatment Session Completed activity with approved metadata and navigation CTA', () => {
    mockUseClientTimeline.mockReturnValue({
      data: {
        items: [
          {
            id: 'timeline_entry_1',
            clientId: 'client_123',
            sourceModule: 'kinesiology',
            eventType: 'TreatmentSessionCompleted',
            summary: 'Treatment session completed for lower back rehabilitation',
            metadata: {
              sessionId: 'sess_abc_123',
              therapistId: 'therapist_xyz_999',
              appointmentId: 'appt_555',
            },
            occurredAt: '2026-08-17T14:30:00.000Z',
          },
          {
            id: 'timeline_entry_2',
            clientId: 'client_123',
            sourceModule: 'client',
            eventType: 'CLIENT_CREATED',
            summary: 'Client profile registered',
            metadata: {},
            occurredAt: '2026-08-01T09:00:00.000Z',
          },
        ],
        total: 2,
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
        <ClientTimelineList clientId="client_123" />
      </MemoryRouter>,
    );

    // Timeline entries rendered
    expect(screen.getByText('Treatment Session Completed')).toBeInTheDocument();
    expect(screen.getByText('Client Profile Created')).toBeInTheDocument();

    // Summary displayed
    expect(
      screen.getByText('Treatment session completed for lower back rehabilitation'),
    ).toBeInTheDocument();

    // Approved metadata tags displayed
    expect(screen.getByText('therapist_xyz_999')).toBeInTheDocument();
    expect(screen.getByText('appt_555')).toBeInTheDocument();

    // View Treatment Session CTA exists with proper accessible label
    const viewSessionBtn = screen.getByRole('button', {
      name: /View treatment session sess_abc_123/i,
    });
    expect(viewSessionBtn).toBeInTheDocument();

    // Verify clinical notes are not exposed
    expect(screen.queryByText(/SOAP/i)).not.toBeInTheDocument();
  });
});
