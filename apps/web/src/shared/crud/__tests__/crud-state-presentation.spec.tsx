import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { CrudEmpty } from '../components/crud-empty';
import { CrudError } from '../components/crud-error';
import { CrudLoading } from '../components/crud-loading';
import { CrudStateView } from '../components/crud-state-view';

describe('Track C Step C3.1: CRUD State Presentation Framework', () => {
  describe('1. CrudLoading Component', () => {
    it('renders table skeleton with default and custom row count and accessible attributes', () => {
      const { rerender } = render(<CrudLoading variant="table" />);
      const statusEl = screen.getByRole('status');
      expect(statusEl).toHaveAttribute('aria-busy', 'true');
      expect(statusEl).toHaveAttribute('aria-live', 'polite');

      // Default count = 5
      expect(statusEl.querySelectorAll('.rounded-full').length).toBe(10); // 5 avatar + 5 badge skeletons

      // Custom count = 3
      rerender(<CrudLoading variant="table" count={3} />);
      expect(screen.getByRole('status').querySelectorAll('.rounded-full').length).toBe(6);
    });

    it('renders card grid skeleton layout', () => {
      render(<CrudLoading variant="card" count={4} />);
      const statusEl = screen.getByRole('status');
      expect(statusEl).toHaveClass('grid');
      expect(statusEl.querySelectorAll('.rounded-lg').length).toBe(4);
    });

    it('renders detail view skeleton layout', () => {
      render(<CrudLoading variant="detail" />);
      const statusEl = screen.getByRole('status');
      expect(statusEl).toBeInTheDocument();
      expect(statusEl.querySelectorAll('.md\\:col-span-2').length).toBe(1);
    });

    it('renders form skeleton layout', () => {
      render(<CrudLoading variant="form" />);
      const statusEl = screen.getByRole('status');
      expect(statusEl).toBeInTheDocument();
      expect(statusEl.querySelectorAll('.h-10').length).toBe(2);
    });

    it('renders custom fallback when provided', () => {
      render(
        <CrudLoading
          variant="custom"
          customFallback={<div data-testid="custom-spinner">Loading Custom...</div>}
        />,
      );
      expect(screen.getByTestId('custom-spinner')).toBeInTheDocument();
    });
  });

  describe('2. CrudEmpty Component', () => {
    it('renders system empty state with default title, description, and action CTA', () => {
      const handleCreate = jest.fn();
      render(
        <CrudEmpty type="dataset" action={<button onClick={handleCreate}>+ Create User</button>} />,
      );

      expect(screen.getByText('No records found')).toBeInTheDocument();
      expect(screen.getByText(/there are currently no records available/i)).toBeInTheDocument();

      const createBtn = screen.getByRole('button', { name: /\+ create user/i });
      fireEvent.click(createBtn);
      expect(handleCreate).toHaveBeenCalledTimes(1);
    });

    it('renders filtered empty state with reset filters button', () => {
      const handleReset = jest.fn();
      render(
        <CrudEmpty type="filtered" title="No users match search" onResetFilters={handleReset} />,
      );

      expect(screen.getByText('No users match search')).toBeInTheDocument();
      expect(
        screen.getByText(/no records match your active search or filter criteria/i),
      ).toBeInTheDocument();

      const resetBtn = screen.getByRole('button', { name: /reset active search and filters/i });
      fireEvent.click(resetBtn);
      expect(handleReset).toHaveBeenCalledTimes(1);
    });
  });

  describe('3. CrudError Component & Sanitization', () => {
    it('sanitizes sensitive database and internal technical stack errors', () => {
      render(
        <CrudError error="PrismaClientKnownRequestError: SELECT * FROM `users` WHERE `tenant_id` = '123' - Connection Refused" />,
      );

      expect(screen.getByText('Failed to load data')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Unable to load data due to a temporary server issue. Please try again shortly.',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText(/PrismaClientKnownRequestError/i)).not.toBeInTheDocument();
    });

    it('presents clean user-facing error messages and correlation ID', () => {
      const handleRetry = jest.fn();
      render(
        <CrudError
          title="Unable to load appointments"
          error="You do not have active permission to view scheduling resources."
          correlationId="req_98765_xyz"
          onRetry={handleRetry}
          retryLabel="Try Again"
        />,
      );

      expect(screen.getByText('Unable to load appointments')).toBeInTheDocument();
      expect(
        screen.getByText('You do not have active permission to view scheduling resources.'),
      ).toBeInTheDocument();
      expect(screen.getByText('Ref ID: req_98765_xyz')).toBeInTheDocument();

      const retryBtn = screen.getByRole('button', { name: /try again operation/i });
      fireEvent.click(retryBtn);
      expect(handleRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('4. CrudStateView Composed 4-State Lifecycle', () => {
    it('renders loading skeleton when isLoading is true', () => {
      render(
        <CrudStateView isLoading={true}>
          <div data-testid="populated-content">Populated Data</div>
        </CrudStateView>,
      );

      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.queryByTestId('populated-content')).not.toBeInTheDocument();
    });

    it('renders error alert when isError is true', () => {
      render(
        <CrudStateView
          isError={true}
          errorProps={{ title: 'Network Disconnected', error: 'Failed to reach API gateway' }}
        >
          <div data-testid="populated-content">Populated Data</div>
        </CrudStateView>,
      );

      expect(screen.getByText('Network Disconnected')).toBeInTheDocument();
      expect(screen.queryByTestId('populated-content')).not.toBeInTheDocument();
    });

    it('renders empty view when isEmpty is true', () => {
      render(
        <CrudStateView
          isEmpty={true}
          isFiltered={false}
          emptyProps={{ title: 'No memberships registered' }}
        >
          <div data-testid="populated-content">Populated Data</div>
        </CrudStateView>,
      );

      expect(screen.getByText('No memberships registered')).toBeInTheDocument();
      expect(screen.queryByTestId('populated-content')).not.toBeInTheDocument();
    });

    it('renders filtered empty view when isEmpty is true and isFiltered is true', () => {
      const handleReset = jest.fn();
      render(
        <CrudStateView
          isEmpty={true}
          isFiltered={true}
          emptyProps={{ onResetFilters: handleReset }}
        >
          <div data-testid="populated-content">Populated Data</div>
        </CrudStateView>,
      );

      expect(screen.getByText('No matching records found')).toBeInTheDocument();
      const resetBtn = screen.getByRole('button', { name: /reset active search and filters/i });
      fireEvent.click(resetBtn);
      expect(handleReset).toHaveBeenCalledTimes(1);
    });

    it('renders populated children when loaded successfully and shows non-blocking refetch indicator', () => {
      const { rerender } = render(
        <CrudStateView isRefetching={false}>
          <div data-testid="populated-content">Populated Data Table</div>
        </CrudStateView>,
      );

      expect(screen.getByTestId('populated-content')).toBeInTheDocument();
      expect(screen.queryByText('Refreshing...')).not.toBeInTheDocument();

      // Refetching in background while preserving existing populated data
      rerender(
        <CrudStateView isRefetching={true}>
          <div data-testid="populated-content">Populated Data Table</div>
        </CrudStateView>,
      );

      expect(screen.getByTestId('populated-content')).toBeInTheDocument();
      expect(screen.getByText('Refreshing...')).toBeInTheDocument();
    });
  });
});
