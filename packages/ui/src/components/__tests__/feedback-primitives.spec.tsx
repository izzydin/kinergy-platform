import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  Button,
  Skeleton,
  Spinner,
  StateView,
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '../index';

describe('Feedback Primitive Components (@kinergy-platform/ui)', () => {
  describe('Spinner Primitive', () => {
    it('renders accessible spinner with role="status" and aria-busy="true"', () => {
      render(<Spinner label="Loading dashboard..." size="lg" />);

      const spinner = screen.getByRole('status');
      expect(spinner).toBeInTheDocument();
      expect(spinner).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByText('Loading dashboard...')).toBeInTheDocument();
    });
  });

  describe('Skeleton Primitive', () => {
    it('renders pulsing content placeholder with aria-hidden="true"', () => {
      const ref = React.createRef<HTMLDivElement>();
      render(<Skeleton ref={ref} className="h-8 w-32" />);

      const skeleton = ref.current;
      expect(skeleton).toBeInTheDocument();
      expect(skeleton).toHaveAttribute('aria-hidden', 'true');
      expect(skeleton).toHaveClass('animate-pulse');
    });
  });

  describe('Toast Presentational Infrastructure', () => {
    it('renders toast notification with polite or assertive live region', () => {
      render(
        <ToastProvider>
          <ToastViewport>
            <Toast variant="destructive">
              <ToastTitle>System Error</ToastTitle>
              <ToastDescription>Connection to server lost.</ToastDescription>
              <ToastClose data-testid="toast-close" />
            </Toast>
          </ToastViewport>
        </ToastProvider>,
      );

      const toast = screen.getByRole('status');
      expect(toast).toBeInTheDocument();
      expect(toast).toHaveAttribute('aria-live', 'assertive');
      expect(screen.getByText('System Error')).toBeInTheDocument();
      expect(screen.getByTestId('toast-close')).toBeInTheDocument();
    });
  });

  describe('StateView 4-State UI Contract', () => {
    it('renders 1. Loading State when isLoading is true', () => {
      render(
        <StateView isLoading loadingFallback={<div data-testid="custom-loader">Loading...</div>}>
          <div>Populated Content</div>
        </StateView>,
      );

      expect(screen.getByTestId('custom-loader')).toBeInTheDocument();
      expect(screen.queryByText('Populated Content')).not.toBeInTheDocument();
    });

    it('renders 2. Error State banner and executes onRetry when isError is true', () => {
      const handleRetry = jest.fn();
      render(
        <StateView isError errorMessage="Failed to fetch clients" onRetry={handleRetry}>
          <div>Populated Content</div>
        </StateView>,
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Failed to fetch clients')).toBeInTheDocument();

      const retryButton = screen.getByRole('button', { name: /try again/i });
      fireEvent.click(retryButton);
      expect(handleRetry).toHaveBeenCalledTimes(1);
    });

    it('renders 3. Empty State view with title, description, and CTA when isEmpty is true', () => {
      render(
        <StateView
          isEmpty
          emptyTitle="No Clients Registered"
          emptyDescription="Click below to add a client profile."
          emptyAction={<Button>Add Client</Button>}
        >
          <div>Populated Content</div>
        </StateView>,
      );

      expect(screen.getByText('No Clients Registered')).toBeInTheDocument();
      expect(screen.getByText('Click below to add a client profile.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /add client/i })).toBeInTheDocument();
    });

    it('renders 4. Populated State (Success) when operation resolves successfully', () => {
      render(
        <StateView>
          <div data-testid="populated-data">Domain Records List</div>
        </StateView>,
      );

      expect(screen.getByTestId('populated-data')).toBeInTheDocument();
      expect(screen.getByText('Domain Records List')).toBeInTheDocument();
    });
  });
});
