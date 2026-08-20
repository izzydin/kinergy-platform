import '@testing-library/jest-dom';
import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import {
  Form,
  FormActions,
  FormCancelButton,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormResetButton,
  FormSubmitButton,
} from '../index';

describe('Form Submit Actions (C1.4 Contract)', () => {
  describe('FormSubmitButton', () => {
    it('renders with type="submit" and accessible name', () => {
      render(<FormSubmitButton>Save Changes</FormSubmitButton>);

      const button = screen.getByRole('button', { name: /save changes/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute('type', 'submit');
      expect(button).not.toBeDisabled();
      expect(button).not.toHaveAttribute('aria-busy');
    });

    it('triggers form submission on click when inside a form', () => {
      const onSubmit = jest.fn((e: React.FormEvent) => e.preventDefault());

      render(
        <form onSubmit={onSubmit}>
          <input name="test" defaultValue="value" />
          <FormSubmitButton>Submit</FormSubmitButton>
        </form>,
      );

      fireEvent.click(screen.getByRole('button', { name: /submit/i }));
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('submits form via keyboard Enter key in an input field', () => {
      const onSubmit = jest.fn((e: React.FormEvent) => e.preventDefault());

      render(
        <form onSubmit={onSubmit}>
          <input data-testid="test-input" name="test" />
          <FormSubmitButton>Submit</FormSubmitButton>
        </form>,
      );

      const input = screen.getByTestId('test-input');
      fireEvent.submit(input.closest('form')!);
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('associates with an external form via the form attribute', () => {
      const onSubmit = jest.fn((e: React.FormEvent) => e.preventDefault());

      render(
        <div>
          <form id="external-form" onSubmit={onSubmit}>
            <input name="test" defaultValue="external" />
          </form>
          <FormSubmitButton form="external-form">Save External</FormSubmitButton>
        </div>,
      );

      const button = screen.getByRole('button', { name: /save external/i });
      expect(button).toHaveAttribute('form', 'external-form');
    });

    it('reflects isPending state by disabling button and setting aria-busy', () => {
      render(
        <FormSubmitButton isPending loadingText="Saving...">
          Save
        </FormSubmitButton>,
      );

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByText('Saving...')).toBeInTheDocument();
    });

    it('reflects isSubmitting alias state by disabling button and setting aria-busy', () => {
      render(<FormSubmitButton isSubmitting>Save</FormSubmitButton>);

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-busy', 'true');
    });

    it('prevents duplicate submission while pending', () => {
      const onSubmit = jest.fn((e: React.FormEvent) => e.preventDefault());

      render(
        <form onSubmit={onSubmit}>
          <FormSubmitButton isPending>Submit</FormSubmitButton>
        </form>,
      );

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('honors explicit disabled prop even when isPending is false', () => {
      render(<FormSubmitButton disabled>Save</FormSubmitButton>);

      expect(screen.getByRole('button')).toBeDisabled();
      expect(screen.getByRole('button')).not.toHaveAttribute('aria-busy');
    });

    it('forwards ref to the underlying HTML button element', () => {
      const ref = React.createRef<HTMLButtonElement>();

      render(<FormSubmitButton ref={ref}>Ref Button</FormSubmitButton>);

      expect(ref.current).toBeInstanceOf(HTMLButtonElement);
      expect(ref.current?.type).toBe('submit');
    });
  });

  describe('FormCancelButton', () => {
    it('renders with type="button" and default "Cancel" label', () => {
      render(<FormCancelButton onCancel={() => {}} />);

      const button = screen.getByRole('button', { name: /cancel/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute('type', 'button');
      expect(button).not.toBeDisabled();
    });

    it('invokes onCancel callback on click and NEVER submits the form', () => {
      const onCancel = jest.fn();
      const onSubmit = jest.fn((e: React.FormEvent) => e.preventDefault());

      render(
        <form onSubmit={onSubmit}>
          <FormCancelButton onCancel={onCancel}>Dismiss</FormCancelButton>
        </form>,
      );

      fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('is disabled when isPending or isSubmitting is true to prevent request interruption', () => {
      const { rerender } = render(<FormCancelButton onCancel={() => {}} isPending={true} />);

      expect(screen.getByRole('button')).toBeDisabled();

      rerender(<FormCancelButton onCancel={() => {}} isSubmitting={true} />);
      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('honors explicit disabled prop', () => {
      render(<FormCancelButton onCancel={() => {}} disabled={true} />);

      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('forwards ref to the underlying HTML button element', () => {
      const ref = React.createRef<HTMLButtonElement>();

      render(<FormCancelButton ref={ref} onCancel={() => {}} />);

      expect(ref.current).toBeInstanceOf(HTMLButtonElement);
      expect(ref.current?.type).toBe('button');
    });
  });

  describe('FormResetButton', () => {
    it('renders with type="button" and default "Reset" label', () => {
      render(<FormResetButton onReset={() => {}} />);

      const button = screen.getByRole('button', { name: /reset/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute('type', 'button');
      expect(button).not.toBeDisabled();
    });

    it('invokes onReset callback on click and NEVER submits the form', () => {
      const onReset = jest.fn();
      const onSubmit = jest.fn((e: React.FormEvent) => e.preventDefault());

      render(
        <form onSubmit={onSubmit}>
          <FormResetButton onReset={onReset}>Clear All</FormResetButton>
        </form>,
      );

      fireEvent.click(screen.getByRole('button', { name: /clear all/i }));

      expect(onReset).toHaveBeenCalledTimes(1);
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('is disabled when isPending or isSubmitting is true', () => {
      const { rerender } = render(<FormResetButton onReset={() => {}} isPending={true} />);

      expect(screen.getByRole('button')).toBeDisabled();

      rerender(<FormResetButton onReset={() => {}} isSubmitting={true} />);
      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('honors explicit disabled prop', () => {
      render(<FormResetButton onReset={() => {}} disabled={true} />);

      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('forwards ref to the underlying HTML button element', () => {
      const ref = React.createRef<HTMLButtonElement>();

      render(<FormResetButton ref={ref} onReset={() => {}} />);

      expect(ref.current).toBeInstanceOf(HTMLButtonElement);
      expect(ref.current?.type).toBe('button');
    });
  });

  describe('FormActions Container', () => {
    it('renders children with default end-alignment and reverse mobile stacking', () => {
      const { container } = render(
        <FormActions>
          <FormCancelButton onCancel={() => {}} />
          <FormSubmitButton>Save</FormSubmitButton>
        </FormActions>,
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('flex-col-reverse');
      expect(wrapper).toHaveClass('sm:justify-end');
      expect(wrapper).toHaveClass('sm:flex-row');
    });

    it('applies start, between, and center alignments on sm+ viewports', () => {
      const { container: startContainer } = render(
        <FormActions align="start">
          <FormSubmitButton>Save</FormSubmitButton>
        </FormActions>,
      );
      expect(startContainer.firstChild).toHaveClass('sm:justify-start');

      const { container: betweenContainer } = render(
        <FormActions align="between">
          <FormCancelButton onCancel={() => {}} />
          <FormSubmitButton>Save</FormSubmitButton>
        </FormActions>,
      );
      expect(betweenContainer.firstChild).toHaveClass('sm:justify-between');

      const { container: centerContainer } = render(
        <FormActions align="center">
          <FormSubmitButton>Save</FormSubmitButton>
        </FormActions>,
      );
      expect(centerContainer.firstChild).toHaveClass('sm:justify-center');
    });

    it('supports mobileDirection configurations (normal, row, reverse)', () => {
      const { container: normalContainer } = render(
        <FormActions mobileDirection="normal">
          <FormSubmitButton>Save</FormSubmitButton>
        </FormActions>,
      );
      expect(normalContainer.firstChild).toHaveClass('flex-col');

      const { container: rowContainer } = render(
        <FormActions mobileDirection="row">
          <FormSubmitButton>Save</FormSubmitButton>
        </FormActions>,
      );
      expect(rowContainer.firstChild).toHaveClass('flex-row');
    });

    it('forwards ref to the underlying HTML div container', () => {
      const ref = React.createRef<HTMLDivElement>();

      render(
        <FormActions ref={ref}>
          <FormSubmitButton>Save</FormSubmitButton>
        </FormActions>,
      );

      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });

    it('merges custom className without dropping layout classes', () => {
      const { container } = render(
        <FormActions className="custom-actions-bar border-t">
          <FormSubmitButton>Save</FormSubmitButton>
        </FormActions>,
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('custom-actions-bar');
      expect(wrapper).toHaveClass('border-t');
      expect(wrapper).toHaveClass('sm:justify-end');
    });
  });

  describe('Integrated Form Action Composition', () => {
    interface TestFormData {
      username: string;
    }

    const TestFeatureForm: React.FC<{
      onSubmit: (data: TestFormData) => void;
      onCancel: () => void;
      isPending?: boolean;
    }> = ({ onSubmit, onCancel, isPending = false }) => {
      const form = useForm<TestFormData>({
        defaultValues: { username: '' },
      });

      return (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <input data-testid="username-input" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormActions align="between">
              <FormCancelButton onCancel={onCancel} isPending={isPending} />
              <div className="flex gap-2">
                <FormResetButton onReset={() => form.reset()} isPending={isPending} />
                <FormSubmitButton isPending={isPending} loadingText="Saving...">
                  Save Changes
                </FormSubmitButton>
              </div>
            </FormActions>
          </form>
        </Form>
      );
    };

    it('submits valid form data on submit button click', async () => {
      const onSubmit = jest.fn();
      const onCancel = jest.fn();

      render(<TestFeatureForm onSubmit={onSubmit} onCancel={onCancel} />);

      act(() => {
        fireEvent.change(screen.getByTestId('username-input'), {
          target: { value: 'alice_smith' },
        });
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
      });

      expect(onSubmit).toHaveBeenCalledWith({ username: 'alice_smith' }, expect.anything());
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('cancels without submitting form data', () => {
      const onSubmit = jest.fn();
      const onCancel = jest.fn();

      render(<TestFeatureForm onSubmit={onSubmit} onCancel={onCancel} />);

      act(() => {
        fireEvent.change(screen.getByTestId('username-input'), {
          target: { value: 'alice_smith' },
        });
      });

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('resets form inputs to initial values without submitting', () => {
      const onSubmit = jest.fn();
      const onCancel = jest.fn();

      render(<TestFeatureForm onSubmit={onSubmit} onCancel={onCancel} />);

      const input = screen.getByTestId('username-input') as HTMLInputElement;
      act(() => {
        fireEvent.change(input, { target: { value: 'bob_jones' } });
      });
      expect(input.value).toBe('bob_jones');

      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /reset/i }));
      });

      expect(input.value).toBe('');
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('locks all action buttons when isPending is true', () => {
      render(<TestFeatureForm onSubmit={jest.fn()} onCancel={jest.fn()} isPending={true} />);

      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /reset/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /saving\.\.\./i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /saving\.\.\./i })).toHaveAttribute(
        'aria-busy',
        'true',
      );
    });
  });
});
