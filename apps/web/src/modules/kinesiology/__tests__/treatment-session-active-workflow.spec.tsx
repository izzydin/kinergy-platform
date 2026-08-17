import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TreatmentSessionWorkspacePage } from '../routes/treatment-session-workspace-page';
import { useTreatmentSession } from '../hooks/use-treatment-session';
import { useTreatmentMutations } from '../hooks/use-treatment-mutations';

jest.mock('../hooks/use-treatment-session');
jest.mock('../hooks/use-treatment-mutations');

const mockUseTreatmentSession = useTreatmentSession as jest.Mock;
const mockUseTreatmentMutations = useTreatmentMutations as jest.Mock;

describe('Active Treatment Workflow Master Integration Spec', () => {
  const startMutate = jest.fn();
  const completeMutate = jest.fn();
  const updateNotesMutate = jest.fn();

  beforeEach(() => {
    mockUseTreatmentMutations.mockReturnValue({
      startSession: { mutate: startMutate, isPending: false },
      completeSession: { mutate: completeMutate, isPending: false },
      assignTherapist: { mutate: jest.fn(), isPending: false },
      updateNotes: { mutate: updateNotesMutate, isPending: false },
      cancelSession: { mutate: jest.fn(), isPending: false },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('displays active encounter banner and allows saving SOAP notes when IN_PROGRESS', async () => {
    mockUseTreatmentSession.mockReturnValue({
      data: {
        id: 'sess_active_100',
        clientId: 'client_alpha',
        appointmentId: 'appt_beta',
        therapistId: 'therapist_gamma',
        status: 'IN_PROGRESS',
        notes: {
          subjective: 'Initial complaint: Upper neck stiffness',
          objective: 'Cervical rotation restricted to 45 deg',
        },
        version: 2,
        createdAt: '2026-08-17T10:00:00.000Z',
        updatedAt: '2026-08-17T10:15:00.000Z',
      },
      isLoading: false,
      isError: false,
    });

    render(
      <MemoryRouter initialEntries={['/kinesiology/sessions/sess_active_100']}>
        <Routes>
          <Route
            path="/kinesiology/sessions/:sessionId"
            element={<TreatmentSessionWorkspacePage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    // Active Encounter Banner should be displayed
    expect(screen.getByText(/Active Clinical Encounter in Progress/i)).toBeInTheDocument();

    // Verify form display
    expect(screen.getByDisplayValue('Initial complaint: Upper neck stiffness')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Cervical rotation restricted to 45 deg')).toBeInTheDocument();

    // Edit SOAP assessment
    const assessmentTextarea = screen.getByPlaceholderText(/Practitioner diagnostic evaluation/i);
    fireEvent.change(assessmentTextarea, {
      target: { value: 'Hypertonic trapezius causing range limitation' },
    });

    const saveNotesBtn = screen.getByRole('button', { name: /Save Notes/i });
    expect(saveNotesBtn).not.toBeDisabled();
    fireEvent.click(saveNotesBtn);

    await waitFor(() => {
      expect(updateNotesMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          assessment: 'Hypertonic trapezius causing range limitation',
        }),
      );
    });
  });

  it('displays post-completion summary and navigation links when session is COMPLETED', () => {
    mockUseTreatmentSession.mockReturnValue({
      data: {
        id: 'sess_completed_200',
        clientId: 'client_alpha',
        appointmentId: 'appt_beta',
        therapistId: 'therapist_gamma',
        status: 'COMPLETED',
        notes: {
          subjective: 'Neck pain resolved',
          objective: 'Full ROM restored',
          assessment: 'Discharge criteria met',
          plan: 'Maintain daily stretches',
        },
        version: 3,
        createdAt: '2026-08-17T10:00:00.000Z',
        updatedAt: '2026-08-17T11:00:00.000Z',
      },
      isLoading: false,
      isError: false,
    });

    render(
      <MemoryRouter initialEntries={['/kinesiology/sessions/sess_completed_200']}>
        <Routes>
          <Route
            path="/kinesiology/sessions/:sessionId"
            element={<TreatmentSessionWorkspacePage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    // Post-completion card displayed
    expect(screen.getByText(/Treatment Encounter Finalized & Signed/i)).toBeInTheDocument();

    // Post-completion navigation buttons exist
    expect(screen.getByRole('button', { name: /View Treatment History/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /View Client Timeline/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Client Profile/i })).toBeInTheDocument();

    // Inappropriate actions must be hidden
    expect(screen.queryByRole('button', { name: /Start Session/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sign & Complete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Change Therapist/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cancel Session/i })).not.toBeInTheDocument();
  });
});
