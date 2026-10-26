import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SoapNotesForm } from '../components/soap-notes-form';

describe('SOAP Notes and Reliable Persistence (Milestone 5.2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Loading existing SOAP note', () => {
    it('renders all 4 SOAP sections with existing server values', () => {
      const onSave = jest.fn();
      render(
        <SoapNotesForm
          sessionStatus="IN_PROGRESS"
          initialNotes={{
            subjective: 'Patient reports mild lumbar tension after running.',
            objective: 'Hamstring length test reveals bilateral tightness 60 degrees.',
            assessment: 'Kinetic chain dysfunction secondary to pelvic tilt.',
            plan: 'Stretching protocol, follow-up in 10 days.',
            rawText: 'Spoke with patient at 09:30 AM.',
          }}
          lastServerUpdatedAt="2026-10-26T14:30:00.000Z"
          onSave={onSave}
        />,
      );

      // Verify header and presence
      expect(screen.getByText(/Clinical SOAP Documentation/i)).toBeInTheDocument();

      // Check section values
      expect(
        screen.getByDisplayValue('Patient reports mild lumbar tension after running.'),
      ).toBeInTheDocument();
      expect(
        screen.getByDisplayValue('Hamstring length test reveals bilateral tightness 60 degrees.'),
      ).toBeInTheDocument();
      expect(
        screen.getByDisplayValue('Kinetic chain dysfunction secondary to pelvic tilt.'),
      ).toBeInTheDocument();
      expect(
        screen.getByDisplayValue('Stretching protocol, follow-up in 10 days.'),
      ).toBeInTheDocument();

      // Check character counters for loaded values
      expect(screen.getByText(/50 \/ 10,000/)).toBeInTheDocument(); // Subjective
      expect(screen.getByText(/61 \/ 10,000/)).toBeInTheDocument(); // Objective

      // Check server-confirmed saved badge
      expect(screen.getByTestId('notes-saved-badge')).toBeInTheDocument();
      expect(screen.getByTestId('notes-saved-badge')).toHaveTextContent(/Saved to server/i);

      // Save button should be disabled when clean
      const saveBtn = screen.getByTestId('soap-save-btn');
      expect(saveBtn).toBeDisabled();
    });

    it('renders optional freeform notes when rawText is present', () => {
      const onSave = jest.fn();
      render(
        <SoapNotesForm
          sessionStatus="IN_PROGRESS"
          initialNotes={{
            rawText: 'Legacy clinical notes dictation.',
          }}
          onSave={onSave}
        />,
      );

      expect(screen.getByDisplayValue('Legacy clinical notes dictation.')).toBeInTheDocument();
    });
  });

  describe('2. Explicit Save Action and Persistence State Machine', () => {
    it('transitions cleanly: Clean -> Dirty (Unsaved) -> Saving -> Confirmed Saved', async () => {
      let resolveSave: () => void = () => {};
      const onSave = jest.fn().mockImplementation(() => {
        return new Promise<void>((resolve) => {
          resolveSave = resolve;
        });
      });

      const { rerender } = render(
        <SoapNotesForm
          sessionStatus="IN_PROGRESS"
          initialNotes={{ subjective: 'Initial status' }}
          onSave={onSave}
          isSaving={false}
        />,
      );

      const subjectiveInput = screen.getByLabelText(/Subjective/i);
      const saveBtn = screen.getByTestId('soap-save-btn');

      // 1. Initial Clean state: save button disabled, no unsaved changes badge
      expect(saveBtn).toBeDisabled();
      expect(screen.queryByTestId('notes-unsaved-badge')).not.toBeInTheDocument();

      // 2. User types new content -> Dirty state
      fireEvent.change(subjectiveInput, {
        target: { value: 'Severe neck strain since Monday.' },
      });

      expect(screen.getByTestId('notes-unsaved-badge')).toBeInTheDocument();
      expect(screen.getByTestId('notes-unsaved-badge')).toHaveTextContent(/Unsaved changes/i);
      expect(saveBtn).not.toBeDisabled();

      // 3. Click Save Notes -> onSave invoked
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({
            subjective: 'Severe neck strain since Monday.',
          }),
        );
      });

      // Re-render with isSaving: true (as triggered by parent mutation)
      rerender(
        <SoapNotesForm
          sessionStatus="IN_PROGRESS"
          initialNotes={{ subjective: 'Initial status' }}
          onSave={onSave}
          isSaving={true}
        />,
      );

      // 4. In-progress saving state
      expect(screen.getByTestId('notes-saving-badge')).toBeInTheDocument();
      expect(screen.getByTestId('notes-saving-badge')).toHaveTextContent(/Saving to server.../i);
      expect(saveBtn).toBeDisabled();
      expect(subjectiveInput).toBeDisabled();

      // 5. Server confirms persistence
      resolveSave();

      rerender(
        <SoapNotesForm
          sessionStatus="IN_PROGRESS"
          initialNotes={{ subjective: 'Severe neck strain since Monday.' }}
          lastServerUpdatedAt="2026-10-26T14:40:00.000Z"
          onSave={onSave}
          isSaving={false}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('notes-saved-badge')).toBeInTheDocument();
      });
      expect(screen.getByTestId('notes-saved-badge')).toHaveTextContent(/Saved to server/i);
      expect(saveBtn).toBeDisabled();
    });
  });

  describe('3. Validation & Length Constraints', () => {
    it('enforces 10,000 character limit per section with accessible error', async () => {
      const onSave = jest.fn();

      render(<SoapNotesForm sessionStatus="IN_PROGRESS" onSave={onSave} />);

      const subjectiveInput = screen.getByLabelText(/Subjective/i);

      // Paste text longer than 10,000 characters
      const overlimitText = 'A'.repeat(10001);
      fireEvent.change(subjectiveInput, { target: { value: overlimitText } });

      const saveBtn = screen.getByTestId('soap-save-btn');
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/Subjective notes cannot exceed 10,000 characters/i),
        ).toBeInTheDocument();
      });

      // Accessibility attributes
      expect(subjectiveInput).toHaveAttribute('aria-invalid', 'true');
      expect(onSave).not.toHaveBeenCalled();
    });

    it('enforces total 50,000 character limit across all sections', async () => {
      const onSave = jest.fn();

      render(<SoapNotesForm sessionStatus="IN_PROGRESS" onSave={onSave} />);

      const subjectiveInput = screen.getByLabelText(/S — Subjective/i);
      const objectiveInput = screen.getByLabelText(/O — Objective/i);
      const assessmentInput = screen.getByLabelText(/A — Assessment/i);
      const planInput = screen.getByLabelText(/P — Plan/i);

      // Total > 50,000 across sections
      fireEvent.change(subjectiveInput, { target: { value: 'S'.repeat(10000) } });
      fireEvent.change(objectiveInput, { target: { value: 'O'.repeat(10000) } });
      fireEvent.change(assessmentInput, { target: { value: 'A'.repeat(10000) } });
      fireEvent.change(planInput, { target: { value: 'P'.repeat(10000) } });

      // Open raw notes and add 10,001
      const showRawBtn = screen.getByRole('button', { name: /Freeform Notes/i });
      fireEvent.click(showRawBtn);

      const rawInput = screen.getByLabelText(/Additional Clinical Notes/i);
      fireEvent.change(rawInput, { target: { value: 'R'.repeat(10001) } });

      const totalCounter = screen.getByTestId('soap-total-counter');
      expect(totalCounter).toHaveTextContent('50,001 / 50,000 chars');

      const saveBtn = screen.getByTestId('soap-save-btn');
      expect(saveBtn).toBeDisabled();
    });
  });

  describe('4. Failure Recovery and Input Preservation', () => {
    it('preserves user input and provides retry when save fails', async () => {
      const mockError = new Error('Database write timed out after 5000ms');
      const onSave = jest.fn().mockRejectedValue(mockError);

      const { rerender } = render(
        <SoapNotesForm
          sessionStatus="IN_PROGRESS"
          initialNotes={{ subjective: 'Old text' }}
          onSave={onSave}
          isSaving={false}
          saveError={null}
        />,
      );

      const subjectiveInput = screen.getByLabelText(/S — Subjective/i);
      fireEvent.change(subjectiveInput, {
        target: { value: 'Critical clinical observation that must not be lost.' },
      });

      const saveBtn = screen.getByTestId('soap-save-btn');
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(onSave).toHaveBeenCalled();
      });

      // Parent captures error and passes saveError prop
      rerender(
        <SoapNotesForm
          sessionStatus="IN_PROGRESS"
          initialNotes={{ subjective: 'Old text' }}
          onSave={onSave}
          isSaving={false}
          saveError={mockError}
        />,
      );

      // Verify error alert
      const errorAlert = screen.getByTestId('soap-save-error-alert');
      expect(errorAlert).toBeInTheDocument();
      expect(errorAlert).toHaveTextContent(/Database write timed out after 5000ms/i);

      // Verify save failed badge
      expect(screen.getByTestId('notes-save-error-badge')).toBeInTheDocument();
      expect(screen.queryByTestId('notes-saved-badge')).not.toBeInTheDocument();

      // CRITICAL: User input MUST be preserved intact
      expect(subjectiveInput).toHaveValue('Critical clinical observation that must not be lost.');

      // Retry button is available
      const retryBtn = screen.getByTestId('soap-retry-save-btn');
      expect(retryBtn).toBeInTheDocument();

      // Trigger retry
      fireEvent.click(retryBtn);
      await waitFor(() => {
        expect(onSave).toHaveBeenCalledTimes(2);
      });
    });

    it('does not display confirmed saved state on ambiguous or failed outcomes', () => {
      const onSave = jest.fn();
      render(
        <SoapNotesForm
          sessionStatus="IN_PROGRESS"
          onSave={onSave}
          saveError={new Error('504 Gateway Timeout')}
        />,
      );

      expect(screen.queryByTestId('notes-saved-badge')).not.toBeInTheDocument();
      expect(screen.getByTestId('soap-save-error-alert')).toBeInTheDocument();
    });
  });

  describe('5. Completed Records and Read-Only Immutability', () => {
    it('locks all inputs and hides save button when session is COMPLETED', () => {
      const onSave = jest.fn();
      render(
        <SoapNotesForm
          sessionStatus="COMPLETED"
          initialNotes={{
            subjective: 'Completed subjective notes',
            objective: 'Completed objective findings',
            assessment: 'Final assessment',
            plan: 'Discharge summary',
          }}
          onSave={onSave}
        />,
      );

      expect(screen.getByTestId('notes-locked-badge')).toBeInTheDocument();
      expect(screen.getByText(/Signed clinical documentation — locked/i)).toBeInTheDocument();

      // All fields must be disabled
      expect(screen.getByDisplayValue('Completed subjective notes')).toBeDisabled();
      expect(screen.getByDisplayValue('Completed objective findings')).toBeDisabled();
      expect(screen.getByDisplayValue('Final assessment')).toBeDisabled();
      expect(screen.getByDisplayValue('Discharge summary')).toBeDisabled();

      // No save or discard buttons should exist
      expect(screen.queryByTestId('soap-save-btn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('soap-reset-btn')).not.toBeInTheDocument();
    });

    it('locks inputs when session is CANCELLED', () => {
      const onSave = jest.fn();
      render(
        <SoapNotesForm
          sessionStatus="CANCELLED"
          initialNotes={{ subjective: 'Patient cancelled visit' }}
          onSave={onSave}
        />,
      );

      expect(screen.getByTestId('notes-locked-badge')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Patient cancelled visit')).toBeDisabled();
      expect(screen.queryByTestId('soap-save-btn')).not.toBeInTheDocument();
    });

    it('locks inputs in read-only mode when user lacks canEdit permission', () => {
      const onSave = jest.fn();
      render(
        <SoapNotesForm
          sessionStatus="IN_PROGRESS"
          canEdit={false}
          initialNotes={{ subjective: 'Read only access' }}
          onSave={onSave}
        />,
      );

      expect(screen.getByTestId('notes-locked-badge')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Read only access')).toBeDisabled();
      expect(screen.queryByTestId('soap-save-btn')).not.toBeInTheDocument();
    });
  });

  describe('6. Discarding Edits and Unsaved Guard', () => {
    it('resets edits back to baseline when Discard Edits is clicked', async () => {
      const onSave = jest.fn();

      render(
        <SoapNotesForm
          sessionStatus="IN_PROGRESS"
          initialNotes={{ subjective: 'Baseline text' }}
          onSave={onSave}
        />,
      );

      const subjectiveInput = screen.getByLabelText(/S — Subjective/i);
      fireEvent.change(subjectiveInput, {
        target: { value: 'Temporary unsaved change' },
      });

      expect(screen.getByTestId('notes-unsaved-badge')).toBeInTheDocument();

      const discardBtn = screen.getByTestId('soap-reset-btn');
      fireEvent.click(discardBtn);

      expect(subjectiveInput).toHaveValue('Baseline text');
      expect(screen.queryByTestId('notes-unsaved-badge')).not.toBeInTheDocument();
    });
  });

  describe('7. Security and Sensitive Data Protection', () => {
    it('does not log clinical note content to console during errors', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      const onSave = jest.fn().mockRejectedValue(new Error('Internal Server Error'));

      render(
        <SoapNotesForm
          sessionStatus="IN_PROGRESS"
          onSave={onSave}
          saveError={new Error('Internal Server Error')}
        />,
      );

      const subjectiveInput = screen.getByLabelText(/S — Subjective/i);
      fireEvent.change(subjectiveInput, {
        target: { value: 'Confidential patient symptom: HIV positive status' },
      });

      const saveBtn = screen.getByTestId('soap-save-btn');
      fireEvent.click(saveBtn);

      // Verify clinical text was never leaked to console
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Confidential patient symptom'),
      );
      expect(logSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Confidential patient symptom'),
      );

      consoleSpy.mockRestore();
      logSpy.mockRestore();
    });
  });
});
