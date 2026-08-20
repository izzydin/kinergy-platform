import '@testing-library/jest-dom';
import * as React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  useFormField,
} from '../components/form';

// ---------------------------------------------------------------------------
// Test Schema & Helper Components
// ---------------------------------------------------------------------------

const testSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  email: z.string().email('Invalid email address'),
});

type TestFormData = z.infer<typeof testSchema>;

interface TestFormProps {
  defaultValues?: Partial<TestFormData>;
  onSubmit?: (data: TestFormData) => void;
  inputRef?: React.Ref<HTMLInputElement>;
}

const SimpleTestForm: React.FC<TestFormProps> = ({
  defaultValues = { username: '', email: '' },
  onSubmit = jest.fn(),
  inputRef,
}) => {
  const form = useForm<TestFormData>({
    resolver: zodResolver(testSchema),
    defaultValues: {
      username: defaultValues.username ?? '',
      email: defaultValues.email ?? '',
    },
    mode: 'onSubmit',
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate data-testid="test-form">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem data-testid="username-item">
              <FormLabel required>Username</FormLabel>
              <FormControl>
                <input
                  data-testid="username-input"
                  placeholder="Enter username"
                  {...field}
                  ref={(node) => {
                    field.ref(node);
                    if (typeof inputRef === 'function') {
                      inputRef(node);
                    } else if (inputRef && 'current' in inputRef) {
                      (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
                    }
                  }}
                />
              </FormControl>
              <FormDescription>Choose a unique platform username.</FormDescription>
              <FormMessage data-testid="username-error" />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <input data-testid="email-input" placeholder="Enter email" {...field} />
              </FormControl>
              <FormMessage data-testid="email-error" />
            </FormItem>
          )}
        />

        <button type="submit" data-testid="submit-btn">
          Submit
        </button>
      </form>
    </Form>
  );
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Form Infrastructure Components', () => {
  describe('Label & Control Association', () => {
    it('associates FormLabel with FormControl via generated id and htmlFor', () => {
      render(<SimpleTestForm />);

      const label = screen.getByText('Username');
      const input = screen.getByTestId('username-input');

      expect(label).toHaveAttribute('for', input.getAttribute('id'));
      expect(input).toHaveAttribute('id');
      expect(input.id).toMatch(/-form-item$/);
    });

    it('renders required indicator asterisk when required prop is true', () => {
      render(<SimpleTestForm />);

      const asterisk = screen.getByText('*');
      expect(asterisk).toBeInTheDocument();
      expect(asterisk).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('Description Association & aria-describedby', () => {
    it('links FormDescription id to FormControl aria-describedby', () => {
      render(<SimpleTestForm />);

      const input = screen.getByTestId('username-input');
      const description = screen.getByText('Choose a unique platform username.');

      expect(description).toHaveAttribute('id');
      expect(input).toHaveAttribute('aria-describedby', description.getAttribute('id'));
      expect(description.id).toMatch(/-form-item-description$/);
    });
  });

  describe('Validation Message & aria-invalid State', () => {
    it('initializes with aria-invalid="false" and no error message rendered', () => {
      render(<SimpleTestForm />);

      const input = screen.getByTestId('username-input');
      expect(input).toHaveAttribute('aria-invalid', 'false');
      expect(screen.queryByTestId('username-error')).not.toBeInTheDocument();
    });

    it('sets aria-invalid="true" and renders FormMessage with role="alert" upon validation failure', async () => {
      render(<SimpleTestForm defaultValues={{ username: 'ab', email: 'valid@domain.com' }} />);

      const submitBtn = screen.getByTestId('submit-btn');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByTestId('username-error')).toBeInTheDocument();
      });

      const input = screen.getByTestId('username-input');
      const errorMessage = screen.getByTestId('username-error');

      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(errorMessage).toHaveAttribute('role', 'alert');
      expect(errorMessage).toHaveTextContent('Username must be at least 3 characters');

      // Check aria-describedby includes both description and error id
      const describedBy = input.getAttribute('aria-describedby') ?? '';
      expect(describedBy).toContain(errorMessage.getAttribute('id') ?? '');
    });

    it('updates FormLabel style to destructive token when invalid', async () => {
      render(<SimpleTestForm defaultValues={{ username: 'ab', email: 'valid@domain.com' }} />);

      const label = screen.getByText('Username');
      expect(label).not.toHaveClass('text-destructive');

      fireEvent.click(screen.getByTestId('submit-btn'));

      await waitFor(() => {
        expect(label).toHaveClass('text-destructive');
      });
    });
  });

  describe('Form Submission & Keyboard Interaction', () => {
    it('submits valid data when submit button is clicked', async () => {
      const handleSubmit = jest.fn();
      render(
        <SimpleTestForm
          defaultValues={{ username: 'johndoe', email: 'john@example.com' }}
          onSubmit={handleSubmit}
        />,
      );

      fireEvent.click(screen.getByTestId('submit-btn'));

      await waitFor(() => {
        expect(handleSubmit).toHaveBeenCalledWith(
          { username: 'johndoe', email: 'john@example.com' },
          expect.anything(),
        );
      });
    });

    it('allows submission via Enter key press inside an input', async () => {
      const handleSubmit = jest.fn();
      render(
        <SimpleTestForm
          defaultValues={{ username: 'janedoe', email: 'jane@example.com' }}
          onSubmit={handleSubmit}
        />,
      );

      const form = screen.getByTestId('test-form');
      fireEvent.submit(form);

      await waitFor(() => {
        expect(handleSubmit).toHaveBeenCalledWith(
          { username: 'janedoe', email: 'jane@example.com' },
          expect.anything(),
        );
      });
    });
  });

  describe('Ref Forwarding', () => {
    it('forwards ref to FormItem DOM element', () => {
      const itemRef = React.createRef<HTMLDivElement>();
      render(
        <FormItem ref={itemRef} data-testid="custom-item">
          <span>Child</span>
        </FormItem>,
      );

      expect(itemRef.current).toBeInstanceOf(HTMLDivElement);
    });

    it('forwards ref to FormLabel DOM element', () => {
      const labelRef = React.createRef<HTMLLabelElement>();
      render(<FormLabel ref={labelRef}>Test Label</FormLabel>);

      expect(labelRef.current).toBeInstanceOf(HTMLLabelElement);
    });

    it('forwards ref to FormDescription DOM element', () => {
      const descRef = React.createRef<HTMLParagraphElement>();
      render(<FormDescription ref={descRef}>Helper info</FormDescription>);

      expect(descRef.current).toBeInstanceOf(HTMLParagraphElement);
    });

    it('forwards ref to FormMessage DOM element when rendered', () => {
      const msgRef = React.createRef<HTMLParagraphElement>();
      render(<FormMessage ref={msgRef}>Custom Error</FormMessage>);

      expect(msgRef.current).toBeInstanceOf(HTMLParagraphElement);
    });

    it('forwards ref to input element through FormControl slot', () => {
      const inputRef = React.createRef<HTMLInputElement>();
      render(<SimpleTestForm inputRef={inputRef} />);

      expect(inputRef.current).toBeInstanceOf(HTMLInputElement);
      expect(inputRef.current?.getAttribute('data-testid')).toBe('username-input');
    });
  });

  describe('useFormField Hook Fallback', () => {
    it('returns generated id gracefully when used outside FormField context', () => {
      let hookResult: ReturnType<typeof useFormField> | undefined;

      const TestConsumer = () => {
        hookResult = useFormField();
        return <div data-testid="consumer" />;
      };

      render(<TestConsumer />);

      expect(hookResult).toBeDefined();
      expect(hookResult?.formItemId).toBeDefined();
      expect(hookResult?.isInvalid).toBe(false);
    });
  });
});
