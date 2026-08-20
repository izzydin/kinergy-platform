import '@testing-library/jest-dom';
import * as React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormValidationSummary,
  useApplyServerErrors,
} from '../index';
import { ValidationError } from '../../query';

// ---------------------------------------------------------------------------
// Test Schema & Harness
// ---------------------------------------------------------------------------

const registerUserSchema = z.object({
  fullName: z.string().min(3, 'Full name must be at least 3 characters'),
  email: z.string().min(1, 'Email is required').email('Invalid email address format'),
  age: z.coerce.number().min(18, 'Must be at least 18 years old'),
});

type RegisterUserFormData = z.infer<typeof registerUserSchema>;

interface TestHarnessProps {
  defaultValues?: Partial<RegisterUserFormData>;
  onSubmit?: (data: RegisterUserFormData) => void | Promise<void>;
  focusFirstError?: boolean;
  onGenericServerError?: (error: Error) => void;
}

const RegistrationFormHarness: React.FC<TestHarnessProps> = ({
  defaultValues = { fullName: '', email: '', age: '' as unknown as number },
  onSubmit = jest.fn(),
  focusFirstError = false,
  onGenericServerError,
}) => {
  const form = useForm<RegisterUserFormData>({
    resolver: zodResolver(registerUserSchema),
    defaultValues: {
      fullName: defaultValues.fullName ?? '',
      email: defaultValues.email ?? '',
      age: defaultValues.age ?? ('' as unknown as number),
    },
    mode: 'onSubmit',
  });

  const applyServerErrors = useApplyServerErrors<RegisterUserFormData>(form.setError);

  const handleSubmit = async (values: RegisterUserFormData) => {
    try {
      await onSubmit(values);
    } catch (err: unknown) {
      if (err instanceof ValidationError) {
        applyServerErrors(err);
      } else if (onGenericServerError && err instanceof Error) {
        onGenericServerError(err);
      }
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} noValidate data-testid="reg-form">
        <FormValidationSummary data-testid="validation-summary" focusFirstError={focusFirstError} />

        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>Full Name</FormLabel>
              <FormControl>
                <input data-testid="fullname-input" placeholder="Jane Doe" {...field} />
              </FormControl>
              <FormMessage data-testid="fullname-error" />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>Email Address</FormLabel>
              <FormControl>
                <input
                  data-testid="email-input"
                  type="email"
                  placeholder="jane@example.com"
                  {...field}
                />
              </FormControl>
              <FormDescription>Account login email</FormDescription>
              <FormMessage data-testid="email-error" />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="age"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Age</FormLabel>
              <FormControl>
                <input data-testid="age-input" type="number" placeholder="25" {...field} />
              </FormControl>
              <FormMessage data-testid="age-error" />
            </FormItem>
          )}
        />

        <button type="submit" data-testid="submit-btn">
          Register User
        </button>
      </form>
    </Form>
  );
};

// ---------------------------------------------------------------------------
// Test Suites
// ---------------------------------------------------------------------------

describe('Form Validation & Validation Summary (C1.2 Contract)', () => {
  describe('Client-Side Validation Scenarios', () => {
    it('handles one validation error correctly (summary + field error)', async () => {
      render(
        <RegistrationFormHarness
          defaultValues={{
            fullName: 'Valid Name',
            email: 'invalid-email',
            age: 25,
          }}
        />,
      );

      fireEvent.click(screen.getByTestId('submit-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('validation-summary')).toBeInTheDocument();
      });

      // Summary lists the single error item
      expect(screen.getByTestId('validation-summary-item-email')).toHaveTextContent(
        'Invalid email address format',
      );

      // Field error renders alongside the control
      expect(screen.getByTestId('email-error')).toHaveTextContent('Invalid email address format');
      expect(screen.getByTestId('email-input')).toHaveAttribute('aria-invalid', 'true');

      // Valid fields remain without error
      expect(screen.queryByTestId('fullname-error')).not.toBeInTheDocument();
      expect(screen.getByTestId('fullname-input')).toHaveAttribute('aria-invalid', 'false');
    });

    it('handles multiple validation errors simultaneously', async () => {
      render(
        <RegistrationFormHarness
          defaultValues={{
            fullName: 'J',
            email: 'not-an-email',
            age: 15,
          }}
        />,
      );

      fireEvent.click(screen.getByTestId('submit-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('validation-summary')).toBeInTheDocument();
      });

      // All errors summarized
      expect(screen.getByTestId('validation-summary-item-fullName')).toHaveTextContent(
        'Full name must be at least 3 characters',
      );
      expect(screen.getByTestId('validation-summary-item-email')).toHaveTextContent(
        'Invalid email address format',
      );
      expect(screen.getByTestId('validation-summary-item-age')).toHaveTextContent(
        'Must be at least 18 years old',
      );

      // Individual field messages match
      expect(screen.getByTestId('fullname-error')).toHaveTextContent(
        'Full name must be at least 3 characters',
      );
      expect(screen.getByTestId('email-error')).toHaveTextContent('Invalid email address format');
      expect(screen.getByTestId('age-error')).toHaveTextContent('Must be at least 18 years old');
    });

    it('focuses the first invalid field when focusFirstError is true', async () => {
      render(
        <RegistrationFormHarness
          focusFirstError={true}
          defaultValues={{
            fullName: '',
            email: 'valid@example.com',
            age: 25,
          }}
        />,
      );

      fireEvent.click(screen.getByTestId('submit-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('fullname-input')).toHaveFocus();
      });
    });

    it('focuses corresponding input when clicking an item in the validation summary', async () => {
      render(
        <RegistrationFormHarness
          defaultValues={{
            fullName: 'Valid Name',
            email: 'bad-email',
            age: 10,
          }}
        />,
      );

      fireEvent.click(screen.getByTestId('submit-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('validation-summary')).toBeInTheDocument();
      });

      // Click on the age error button in summary
      const ageSummaryBtn = screen.getByTestId('validation-summary-item-age');
      fireEvent.click(ageSummaryBtn);

      expect(screen.getByTestId('age-input')).toHaveFocus();

      // Click on the email error button in summary
      const emailSummaryBtn = screen.getByTestId('validation-summary-item-email');
      fireEvent.click(emailSummaryBtn);

      expect(screen.getByTestId('email-input')).toHaveFocus();
    });

    it('does not steal focus during ordinary user typing', async () => {
      render(
        <RegistrationFormHarness
          defaultValues={{
            fullName: 'Jane',
            email: '',
            age: 30,
          }}
        />,
      );

      const emailInput = screen.getByTestId('email-input');
      emailInput.focus();
      expect(emailInput).toHaveFocus();

      // User types without submitting
      fireEvent.change(emailInput, { target: { value: 'j' } });

      // Focus remains firmly on the input being edited
      expect(emailInput).toHaveFocus();
      expect(screen.queryByTestId('validation-summary')).not.toBeInTheDocument();
    });
  });

  describe('Server Error Integration Scenarios', () => {
    it('maps server field validation errors into RHF and updates summary and field message', async () => {
      const mockSubmit = jest.fn().mockImplementation(() => {
        throw new ValidationError('Request validation failed', {
          email: ['Email address is already in use by another account'],
        });
      });

      render(
        <RegistrationFormHarness
          defaultValues={{
            fullName: 'Jane Doe',
            email: 'existing@example.com',
            age: 28,
          }}
          onSubmit={mockSubmit}
        />,
      );

      fireEvent.click(screen.getByTestId('submit-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('email-error')).toHaveTextContent(
          'Email address is already in use by another account',
        );
      });

      expect(screen.getByTestId('email-input')).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByTestId('validation-summary-item-email')).toHaveTextContent(
        'Email address is already in use by another account',
      );
    });

    it('does not dump generic server errors into the form fields', async () => {
      const handleGenericError = jest.fn();
      const mockSubmit = jest.fn().mockImplementation(() => {
        throw new Error('500 Internal Server Error: Database unreachable');
      });

      render(
        <RegistrationFormHarness
          defaultValues={{
            fullName: 'Jane Doe',
            email: 'jane@example.com',
            age: 28,
          }}
          onSubmit={mockSubmit}
          onGenericServerError={handleGenericError}
        />,
      );

      fireEvent.click(screen.getByTestId('submit-btn'));

      await waitFor(() => {
        expect(handleGenericError).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('500 Internal Server Error'),
          }),
        );
      });

      // Form fields remain valid and do not display raw 500 error strings
      expect(screen.queryByTestId('fullname-error')).not.toBeInTheDocument();
      expect(screen.queryByTestId('email-error')).not.toBeInTheDocument();
      expect(screen.queryByTestId('validation-summary')).not.toBeInTheDocument();
    });
  });

  describe('Correction & Successful Submission Scenarios', () => {
    it('clears error indicators when invalid field is corrected and resubmitted successfully', async () => {
      const mockSubmit = jest.fn();

      render(
        <RegistrationFormHarness
          defaultValues={{
            fullName: 'Jane Doe',
            email: 'bad-email',
            age: 25,
          }}
          onSubmit={mockSubmit}
        />,
      );

      // 1. Submit with bad email
      fireEvent.click(screen.getByTestId('submit-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('email-error')).toBeInTheDocument();
        expect(screen.getByTestId('validation-summary')).toBeInTheDocument();
      });

      expect(mockSubmit).not.toHaveBeenCalled();

      // 2. Correct the email
      const emailInput = screen.getByTestId('email-input');
      act(() => {
        fireEvent.change(emailInput, { target: { value: 'jane.doe@valid.com' } });
      });

      // 3. Re-submit
      fireEvent.click(screen.getByTestId('submit-btn'));

      await waitFor(() => {
        expect(mockSubmit).toHaveBeenCalledWith({
          fullName: 'Jane Doe',
          email: 'jane.doe@valid.com',
          age: 25,
        });
      });

      // Errors disappear
      expect(screen.queryByTestId('email-error')).not.toBeInTheDocument();
      expect(screen.queryByTestId('validation-summary')).not.toBeInTheDocument();
    });
  });
});
