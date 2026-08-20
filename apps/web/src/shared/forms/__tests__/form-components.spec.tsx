import '@testing-library/jest-dom';
import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { FormValidationSummary } from '../components/form-validation-summary';
import type { FieldErrors } from 'react-hook-form';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const errors: FieldErrors = {
  email: { type: 'required', message: 'Email is required' },
  name: { type: 'minLength', message: 'Name must be at least 2 characters' },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FormValidationSummary', () => {
  it('does not render when isSubmitted is false', () => {
    const { container } = render(<FormValidationSummary errors={errors} isSubmitted={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('does not render when there are no errors', () => {
    const { container } = render(<FormValidationSummary errors={{}} isSubmitted={true} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the summary when isSubmitted and errors exist', () => {
    render(<FormValidationSummary errors={errors} isSubmitted={true} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Please fix the following errors')).toBeInTheDocument();
  });

  it('lists all error messages', () => {
    render(<FormValidationSummary errors={errors} isSubmitted={true} />);
    expect(screen.getByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Name must be at least 2 characters')).toBeInTheDocument();
  });

  it('accepts a custom title', () => {
    render(
      <FormValidationSummary
        errors={errors}
        isSubmitted={true}
        title="Fix these issues before continuing"
      />,
    );
    expect(screen.getByText('Fix these issues before continuing')).toBeInTheDocument();
  });

  it('has role="alert" for immediate screen reader announcement', () => {
    render(<FormValidationSummary errors={errors} isSubmitted={true} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('has aria-live="assertive"', () => {
    render(<FormValidationSummary errors={errors} isSubmitted={true} />);
    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
  });
});

// ---------------------------------------------------------------------------
// FormLayout rendering tests
// ---------------------------------------------------------------------------

import { FormLayout } from '../components/form-layout';

describe('FormLayout', () => {
  it('renders children', () => {
    render(
      <FormLayout>
        <div data-testid="child" />
      </FormLayout>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('applies page variant classes by default', () => {
    const { container } = render(<FormLayout>content</FormLayout>);
    expect(container.firstChild).toHaveClass('max-w-2xl');
  });

  it('applies dialog variant classes', () => {
    const { container } = render(<FormLayout variant="dialog">content</FormLayout>);
    expect(container.firstChild).not.toHaveClass('max-w-2xl');
    expect(container.firstChild).toHaveClass('py-2');
  });

  it('forwards ref', () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<FormLayout ref={ref}>content</FormLayout>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('merges className', () => {
    const { container } = render(<FormLayout className="custom-class">content</FormLayout>);
    expect(container.firstChild).toHaveClass('custom-class');
  });
});

// ---------------------------------------------------------------------------
// FormSubmitButton tests
// ---------------------------------------------------------------------------

import { FormSubmitButton } from '../components/form-submit-button';

describe('FormSubmitButton', () => {
  it('renders as type="submit"', () => {
    render(<FormSubmitButton>Submit</FormSubmitButton>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('is disabled when isPending', () => {
    render(<FormSubmitButton isPending>Submit</FormSubmitButton>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('is not disabled when not pending', () => {
    render(<FormSubmitButton isPending={false}>Submit</FormSubmitButton>);
    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  it('shows aria-busy when isPending', () => {
    render(<FormSubmitButton isPending>Submit</FormSubmitButton>);
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
  });

  it('renders children text', () => {
    render(<FormSubmitButton>Save Changes</FormSubmitButton>);
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// FormCancelButton tests
// ---------------------------------------------------------------------------

import { FormCancelButton } from '../components/form-cancel-button';

describe('FormCancelButton', () => {
  it('renders as type="button" (never submits)', () => {
    render(<FormCancelButton onCancel={() => {}} />);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('calls onCancel when clicked', () => {
    const onCancel = jest.fn();
    render(<FormCancelButton onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('is disabled when isPending', () => {
    render(<FormCancelButton onCancel={() => {}} isPending />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('renders default "Cancel" label', () => {
    render(<FormCancelButton onCancel={() => {}} />);
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('renders custom children', () => {
    render(<FormCancelButton onCancel={() => {}}>Go back</FormCancelButton>);
    expect(screen.getByRole('button', { name: /go back/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ConfirmDiscardDialog tests
// ---------------------------------------------------------------------------

import { ConfirmDiscardDialog } from '../components/confirm-discard-dialog';

describe('ConfirmDiscardDialog', () => {
  it('does not render when closed', () => {
    render(<ConfirmDiscardDialog open={false} onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders when open', () => {
    render(<ConfirmDiscardDialog open={true} onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument();
  });

  it('calls onConfirm when discard button is clicked', () => {
    const onConfirm = jest.fn();
    render(<ConfirmDiscardDialog open={true} onConfirm={onConfirm} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /discard changes/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when keep editing button is clicked', () => {
    const onCancel = jest.fn();
    render(<ConfirmDiscardDialog open={true} onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: /keep editing/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('uses custom title and labels when provided', () => {
    render(
      <ConfirmDiscardDialog
        open={true}
        onConfirm={() => {}}
        onCancel={() => {}}
        title="Leave without saving?"
        confirmLabel="Yes, leave"
        cancelLabel="Stay here"
      />,
    );
    expect(screen.getByText('Leave without saving?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /yes, leave/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /stay here/i })).toBeInTheDocument();
  });
});
