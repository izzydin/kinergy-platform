import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  FormControl,
  FormErrorMessage,
  FormField,
  FormHelperText,
  FormLabel,
  Input,
  PasswordInput,
  Skeleton,
  Spinner,
  Toast,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '../index';

describe('Design System Component Test Suite (@kinergy-platform/ui)', () => {
  describe('1. Button Component', () => {
    it('passes automated accessibility (axe) checks', async () => {
      const { container } = render(<Button variant="default">Accessible Action</Button>);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('renders all variants and size scales with proper class merging', () => {
      const { rerender } = render(
        <Button variant="destructive" size="lg" className="custom-class">
          Delete
        </Button>,
      );
      const button = screen.getByRole('button', { name: /delete/i });
      expect(button).toHaveClass('bg-destructive', 'h-11', 'custom-class');

      rerender(
        <Button variant="outline" size="sm">
          Small Outline
        </Button>,
      );
      expect(screen.getByRole('button')).toHaveClass('border-input', 'h-8');
    });

    it('handles isLoading state, aria-busy attribute, and user interactions', () => {
      const handleClick = jest.fn();
      const { rerender } = render(
        <Button isLoading loadingText="Saving..." onClick={handleClick}>
          Save
        </Button>,
      );

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByText('Saving...')).toBeInTheDocument();

      fireEvent.click(button);
      expect(handleClick).not.toHaveBeenCalled();

      rerender(
        <Button isLoading={false} onClick={handleClick}>
          Save
        </Button>,
      );
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('supports polymorphic asChild rendering via Slot', () => {
      render(
        <Button asChild variant="secondary">
          <a href="/settings">Go to Settings</a>
        </Button>,
      );
      const link = screen.getByRole('link', { name: /go to settings/i });
      expect(link).toHaveAttribute('href', '/settings');
      expect(link).toHaveClass('bg-secondary');
    });
  });

  describe('2. Input Component', () => {
    it('passes automated accessibility (axe) checks with label', async () => {
      const { container } = render(
        <div>
          <label htmlFor="user-email">Email</label>
          <Input id="user-email" type="email" placeholder="email@example.com" />
        </div>,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('applies isInvalid error styling and aria-invalid attribute', () => {
      render(<Input isInvalid placeholder="Invalid input" />);
      const input = screen.getByPlaceholderText('Invalid input');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveClass('border-destructive');
    });

    it('handles user text input interactions and ref forwarding', () => {
      const ref = React.createRef<HTMLInputElement>();
      const handleChange = jest.fn();

      render(<Input ref={ref} placeholder="Type here" onChange={handleChange} />);
      const input = screen.getByPlaceholderText('Type here');
      expect(ref.current).toBe(input);

      fireEvent.change(input, { target: { value: 'New text' } });
      expect(handleChange).toHaveBeenCalledTimes(1);
      expect((input as HTMLInputElement).value).toBe('New text');
    });
  });

  describe('3. PasswordInput Component', () => {
    it('passes automated accessibility (axe) checks', async () => {
      const { container } = render(
        <div>
          <label htmlFor="pass-id">Password</label>
          <PasswordInput id="pass-id" placeholder="Enter password" />
        </div>,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('toggles password visibility on trigger click with aria-label updates', () => {
      render(<PasswordInput placeholder="Secret password" />);
      const input = screen.getByPlaceholderText('Secret password') as HTMLInputElement;
      expect(input.type).toBe('password');

      const toggleButton = screen.getByRole('button', { name: /show password/i });
      fireEvent.click(toggleButton);

      expect(input.type).toBe('text');
      expect(screen.getByRole('button', { name: /hide password/i })).toBeInTheDocument();

      fireEvent.click(toggleButton);
      expect(input.type).toBe('password');
    });
  });

  describe('4. Dialog (Modal Overlay) Component Suite', () => {
    it('passes automated accessibility (axe) checks when open', async () => {
      const { container } = render(
        <Dialog open>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Accessible Modal</DialogTitle>
              <DialogDescription>Modal content description.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button>OK</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('opens content on trigger click, applies WAI-ARIA role="dialog", and dismisses on Escape key', () => {
      const handleOpenChange = jest.fn();
      render(
        <Dialog onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button>Launch Dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Dialog Title</DialogTitle>
              <DialogDescription>Dialog body description.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Dismiss</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>,
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /launch dialog/i }));

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(screen.getByText('Dialog Title')).toBeInTheDocument();
      expect(screen.getByText('Dialog body description.')).toBeInTheDocument();

      fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });
      expect(handleOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('5. Toast Component Suite', () => {
    it('passes automated accessibility (axe) checks', async () => {
      const { container } = render(
        <ToastProvider>
          <ToastViewport>
            <Toast variant="default">
              <ToastTitle>Notification</ToastTitle>
              <ToastDescription>Message content.</ToastDescription>
            </Toast>
          </ToastViewport>
        </ToastProvider>,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('applies polite or assertive live region attributes based on variant', () => {
      const { rerender } = render(
        <Toast variant="default">
          <ToastTitle>Info Toast</ToastTitle>
        </Toast>,
      );
      expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');

      rerender(
        <Toast variant="destructive">
          <ToastTitle>Critical Error</ToastTitle>
        </Toast>,
      );
      expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'assertive');
    });
  });

  describe('6. Skeleton Component', () => {
    it('passes automated accessibility (axe) checks', async () => {
      const { container } = render(<Skeleton className="h-4 w-24" />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('renders with animate-pulse and aria-hidden="true"', () => {
      const { container } = render(<Skeleton className="h-10 w-full" />);
      const skeleton = container.firstChild as HTMLElement;
      expect(skeleton).toHaveClass('animate-pulse', 'bg-muted/70');
      expect(skeleton).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('7. Spinner Component', () => {
    it('passes automated accessibility (axe) checks', async () => {
      const { container } = render(<Spinner label="Processing request..." size="md" />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('renders with role="status", aria-busy="true", and sr-only label text', () => {
      render(<Spinner label="Loading dataset..." size="xl" />);
      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByText('Loading dataset...')).toHaveClass('sr-only');
    });
  });

  describe('8. Alert Component', () => {
    it('passes automated accessibility (axe) checks', async () => {
      const { container } = render(
        <Alert variant="warning">
          <AlertTitle>Warning Notice</AlertTitle>
          <AlertDescription>Please backup your configuration.</AlertDescription>
        </Alert>,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('renders role="alert" and applies variant styles', () => {
      render(
        <Alert variant="destructive">
          <AlertTitle>Error Alert</AlertTitle>
          <AlertDescription>Operation failed.</AlertDescription>
        </Alert>,
      );
      const alert = screen.getByRole('alert');
      expect(alert).toHaveClass('border-destructive/50');
      expect(screen.getByText('Error Alert')).toBeInTheDocument();
    });
  });

  describe('9. Badge Component', () => {
    it('passes automated accessibility (axe) checks', async () => {
      const { container } = render(<Badge variant="secondary">Active Badge</Badge>);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('renders variant and size classes', () => {
      render(
        <Badge variant="destructive" size="md">
          High Priority
        </Badge>,
      );
      const badge = screen.getByText('High Priority');
      expect(badge).toHaveClass('bg-destructive', 'px-2.5');
    });
  });

  describe('10. Avatar Component', () => {
    it('passes automated accessibility (axe) checks', async () => {
      const { container } = render(
        <Avatar>
          <AvatarFallback>AK</AvatarFallback>
        </Avatar>,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('renders avatar image and falls back to AvatarFallback on image load error', () => {
      render(
        <Avatar>
          <AvatarImage src="/missing-avatar.jpg" alt="Jane Doe" />
          <AvatarFallback>JD</AvatarFallback>
        </Avatar>,
      );

      const img = screen.getByAltText('Jane Doe');
      fireEvent.error(img);

      expect(screen.getByText('JD')).toBeInTheDocument();
    });
  });

  describe('11. Card & FormField Primitives', () => {
    it('passes automated accessibility (axe) checks for Card and FormField layout', async () => {
      const { container } = render(
        <Card>
          <CardHeader>
            <CardTitle>User Profile</CardTitle>
            <CardDescription>Update your personal details.</CardDescription>
          </CardHeader>
          <CardContent>
            <FormField controlId="full-name" isInvalid>
              <FormLabel required>Full Name</FormLabel>
              <FormControl>
                <Input placeholder="John Doe" />
              </FormControl>
              <FormHelperText>Enter your official legal name.</FormHelperText>
              <FormErrorMessage>Full name is required.</FormErrorMessage>
            </FormField>
          </CardContent>
          <CardFooter>
            <Button>Save Profile</Button>
          </CardFooter>
        </Card>,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
