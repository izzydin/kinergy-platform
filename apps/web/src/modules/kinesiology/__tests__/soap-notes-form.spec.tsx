import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SoapNotesForm } from '../components/soap-notes-form';

describe('SoapNotesForm Component Unit Tests', () => {
  it('renders all SOAP note fields for an active IN_PROGRESS session', () => {
    const onSave = jest.fn();
    render(
      <SoapNotesForm
        sessionStatus="IN_PROGRESS"
        initialNotes={{
          subjective: 'Initial complaint',
          objective: 'Muscle weakness left shoulder',
        }}
        onSave={onSave}
      />,
    );

    expect(screen.getByText(/Clinical SOAP Documentation/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Initial complaint')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Muscle weakness left shoulder')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save Notes/i })).toBeInTheDocument();
  });

  it('locks all inputs and hides save button when session is COMPLETED (read-only)', () => {
    const onSave = jest.fn();
    render(
      <SoapNotesForm
        sessionStatus="COMPLETED"
        initialNotes={{
          subjective: 'Patient recovered',
        }}
        onSave={onSave}
      />,
    );

    expect(screen.getByText(/Locked \(Read-Only\)/i)).toBeInTheDocument();
    const subjectiveInput = screen.getByDisplayValue('Patient recovered');
    expect(subjectiveInput).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Save Notes/i })).not.toBeInTheDocument();
  });

  it('calls onSave with updated form values when submitted', async () => {
    const onSave = jest.fn();
    render(
      <SoapNotesForm
        sessionStatus="SCHEDULED"
        initialNotes={{
          subjective: 'Initial',
        }}
        onSave={onSave}
      />,
    );

    const subjectiveInput = screen.getByDisplayValue('Initial');
    fireEvent.change(subjectiveInput, { target: { value: 'Updated subjective' } });

    const saveButton = screen.getByRole('button', { name: /Save Notes/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          subjective: 'Updated subjective',
        }),
      );
    });
  });
});
