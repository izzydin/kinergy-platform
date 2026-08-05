import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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
  Input,
} from '../index';

describe('Primitive UI Components (@kinergy-platform/ui)', () => {
  describe('Button Component', () => {
    it('renders children correctly and forwards ref', () => {
      const ref = React.createRef<HTMLButtonElement>();
      render(<Button ref={ref}>Click Me</Button>);

      const button = screen.getByRole('button', { name: /click me/i });
      expect(button).toBeInTheDocument();
      expect(ref.current).toBe(button);
    });

    it('handles isLoading state by setting aria-busy and rendering spinner', () => {
      render(
        <Button isLoading loadingText="Saving...">
          Save
        </Button>,
      );

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(button).toBeDisabled();
      expect(screen.getByText('Saving...')).toBeInTheDocument();
    });

    it('supports polymorphic asChild composition', () => {
      render(
        <Button asChild variant="outline">
          <a href="/dashboard">Dashboard Link</a>
        </Button>,
      );

      const link = screen.getByRole('link', { name: /dashboard link/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/dashboard');
      expect(link).toHaveClass('border-input');
    });
  });

  describe('Input Component', () => {
    it('renders native input and forwards ref', () => {
      const ref = React.createRef<HTMLInputElement>();
      render(<Input ref={ref} placeholder="Enter name" />);

      const input = screen.getByPlaceholderText('Enter name');
      expect(input).toBeInTheDocument();
      expect(ref.current).toBe(input);
    });

    it('applies isInvalid error styling and aria-invalid attribute', () => {
      render(<Input isInvalid placeholder="Invalid input" />);

      const input = screen.getByPlaceholderText('Invalid input');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveClass('border-destructive');
    });
  });

  describe('Card Component', () => {
    it('renders compound Card structure correctly', () => {
      render(
        <Card data-testid="card-root">
          <CardHeader>
            <CardTitle>System Performance</CardTitle>
            <CardDescription>Operational metrics</CardDescription>
          </CardHeader>
          <CardContent>Content Area</CardContent>
          <CardFooter>Footer Actions</CardFooter>
        </Card>,
      );

      expect(screen.getByTestId('card-root')).toHaveClass('bg-card');
      expect(screen.getByText('System Performance')).toBeInTheDocument();
      expect(screen.getByText('Operational metrics')).toBeInTheDocument();
      expect(screen.getByText('Content Area')).toBeInTheDocument();
      expect(screen.getByText('Footer Actions')).toBeInTheDocument();
    });
  });

  describe('Avatar Component', () => {
    it('renders avatar fallback when image fails to load or src is missing', () => {
      render(
        <Avatar>
          <AvatarImage src="/broken-image.jpg" alt="User Avatar" />
          <AvatarFallback>JD</AvatarFallback>
        </Avatar>,
      );

      const image = screen.getByAltText('User Avatar');
      fireEvent.error(image);

      expect(screen.getByText('JD')).toBeInTheDocument();
    });
  });

  describe('Badge Component', () => {
    it('renders badge variants and supports asChild', () => {
      render(
        <Badge variant="destructive" size="sm">
          Active
        </Badge>,
      );

      const badge = screen.getByText('Active');
      expect(badge).toHaveClass('bg-destructive');
    });
  });

  describe('Alert Component', () => {
    it('renders alert with role="alert" and variant styling', () => {
      render(
        <Alert variant="destructive">
          <AlertTitle>Connection Error</AlertTitle>
          <AlertDescription>Failed to sync data with server.</AlertDescription>
        </Alert>,
      );

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveClass('border-destructive/50');
      expect(screen.getByText('Connection Error')).toBeInTheDocument();
      expect(screen.getByText('Failed to sync data with server.')).toBeInTheDocument();
    });
  });
});
