import '@testing-library/jest-dom';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { renderWithProviders } from '../../../test/test-utils';
import { ClientRegistrationForm } from '../components/client-registration-form';
import { ClientDetailsCard } from '../components/client-details-card';
import { ClientArchiveDialog } from '../components/client-archive-dialog';
import { ClientRestoreDialog } from '../components/client-restore-dialog';
import { ClientEditDialog } from '../components/client-edit-dialog';
import { ClientListTable } from '../components/client-list-table';
import { ClientStatusBadge } from '../components/client-status-badge';
import { DataTableRowActions } from '../../../shared/table/components/data-table-row-actions';
import { UserMenu } from '../../../shared/components/header/user-menu';
import type { ClientModel } from '../types/client.types';
import type { AuthUser } from '../../auth/domain/auth-state.types';

expect.extend(toHaveNoViolations);

const mockClient: ClientModel = {
  id: 'cli_test_123',
  referenceNumber: 'CLI-000123',
  firstName: 'Jane',
  lastName: 'Doe',
  fullName: 'Jane Doe',
  email: 'jane.doe@example.com',
  phone: '+1 555-0123',
  status: 'ACTIVE',
  version: 1,
  identityId: 'usr_identity_456',
  createdAt: '2026-08-15T10:00:00.000Z',
  updatedAt: '2026-08-16T12:00:00.000Z',
};

const mockArchivedClient: ClientModel = {
  ...mockClient,
  id: 'cli_archived_999',
  referenceNumber: 'CLI-000999',
  status: 'ARCHIVED',
  version: 2,
};

const mockAdminUser: AuthUser = {
  id: 'usr_admin',
  email: 'admin@kinergy.test',
  name: 'System Admin',
  roles: ['Admin'],
  permissions: ['client:write', 'client:read', 'client:delete', 'identity:link'],
  tenantId: 'tenant_1',
};

describe('Client Experience & Core Shared Patterns — WCAG 2.1 AA Accessibility Suite', () => {
  describe('1. Automated WCAG Accessibility Audits (jest-axe)', () => {
    it('passes automated axe audit on ClientDetailsCard', async () => {
      const { container } = renderWithProviders(<ClientDetailsCard client={mockClient} />, {
        initialSessionOverride: mockAdminUser,
      });
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('passes automated axe audit on ClientRegistrationForm (empty initial state)', async () => {
      const { container } = renderWithProviders(
        <ClientRegistrationForm onSubmit={jest.fn()} onSuccess={jest.fn()} />,
        { initialSessionOverride: mockAdminUser },
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('passes automated axe audit on ClientRegistrationForm with validation errors', async () => {
      const { container } = renderWithProviders(
        <ClientRegistrationForm onSubmit={jest.fn()} onSuccess={jest.fn()} />,
        { initialSessionOverride: mockAdminUser },
      );

      // Trigger submit with empty fields to display validation errors
      fireEvent.click(screen.getByRole('button', { name: /register client/i }));

      await waitFor(() => {
        expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
      });

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('passes automated axe audit on ClientArchiveDialog when open', async () => {
      const { baseElement } = renderWithProviders(
        <ClientArchiveDialog client={mockClient} open={true} onOpenChange={jest.fn()} />,
        { initialSessionOverride: mockAdminUser },
      );

      const results = await axe(baseElement);
      expect(results).toHaveNoViolations();
    });

    it('passes automated axe audit on ClientRestoreDialog when open', async () => {
      const { baseElement } = renderWithProviders(
        <ClientRestoreDialog client={mockArchivedClient} open={true} onOpenChange={jest.fn()} />,
        { initialSessionOverride: mockAdminUser },
      );

      const results = await axe(baseElement);
      expect(results).toHaveNoViolations();
    });

    it('passes automated axe audit on ClientEditDialog when open', async () => {
      const { baseElement } = renderWithProviders(
        <ClientEditDialog client={mockClient} open={true} onOpenChange={jest.fn()} />,
        { initialSessionOverride: mockAdminUser },
      );

      const results = await axe(baseElement);
      expect(results).toHaveNoViolations();
    });

    it('passes automated axe audit on ClientListTable with populated data and pagination', async () => {
      const { container } = renderWithProviders(
        <ClientListTable
          clients={[mockClient, mockArchivedClient]}
          totalCount={2}
          page={1}
          pageSize={10}
          onPageChange={jest.fn()}
        />,
        { initialSessionOverride: mockAdminUser },
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('2. Keyboard Navigation, Menus & Focus Restoration', () => {
    it('manages DataTableRowActions menu keyboard interaction (ArrowDown/Up, Enter, Escape)', () => {
      const handleEdit = jest.fn();
      const handleDelete = jest.fn();
      const actions = [
        { id: 'edit', label: 'Edit Client', onClick: handleEdit },
        { id: 'delete', label: 'Delete Client', onClick: handleDelete, isDestructive: true },
      ];

      renderWithProviders(
        <DataTableRowActions row={mockClient} actions={actions} triggerLabel="Client options" />,
      );

      const trigger = screen.getByRole('button', { name: /client options/i });
      expect(trigger).toHaveAttribute('aria-expanded', 'false');

      // Open via ArrowDown
      fireEvent.keyDown(trigger, { key: 'ArrowDown' });
      expect(screen.getByRole('menu')).toBeInTheDocument();
      expect(trigger).toHaveAttribute('aria-expanded', 'true');

      // Active menuitem is focused
      const editItem = screen.getByRole('menuitem', { name: /edit client/i });
      expect(editItem).toHaveFocus();

      // Navigate down to Delete item
      fireEvent.keyDown(editItem, { key: 'ArrowDown' });
      const deleteItem = screen.getByRole('menuitem', { name: /delete client/i });
      expect(deleteItem).toHaveFocus();

      // Escape closes menu and restores focus to trigger button
      fireEvent.keyDown(deleteItem, { key: 'Escape' });
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });

    it('UserMenu restores focus to trigger on Escape dismissal', () => {
      renderWithProviders(<UserMenu />, { initialSessionOverride: mockAdminUser });

      const userTrigger = screen.getByRole('button', { name: /user account menu/i });
      expect(userTrigger).toHaveAttribute('aria-expanded', 'false');

      // Open menu
      fireEvent.click(userTrigger);
      expect(userTrigger).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('menu')).toBeInTheDocument();

      // Press Escape
      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(userTrigger).toHaveFocus();
    });
  });

  describe('3. Forms, Error Association & Validation Summary', () => {
    it('associates errors with form fields with aria-invalid, aria-describedby and role="alert"', async () => {
      renderWithProviders(<ClientRegistrationForm onSubmit={jest.fn()} onSuccess={jest.fn()} />, {
        initialSessionOverride: mockAdminUser,
      });

      const submitBtn = screen.getByRole('button', { name: /register client/i });
      fireEvent.click(submitBtn);

      const firstNameInput = screen.getByTestId('first-name-input');
      await waitFor(() => {
        expect(firstNameInput).toHaveAttribute('aria-invalid', 'true');
      });
      expect(firstNameInput).toHaveAttribute('aria-required', 'true');

      const messageElement = await screen.findByText(/first name is required/i);
      expect(messageElement).toHaveAttribute('role', 'alert');

      const describedBy = firstNameInput.getAttribute('aria-describedby');
      expect(describedBy).toContain(messageElement.id);
    });

    it('renders FormValidationSummary alert in ClientEditDialog and links directly to invalid fields', async () => {
      renderWithProviders(
        <ClientEditDialog client={mockClient} open={true} onOpenChange={jest.fn()} />,
        { initialSessionOverride: mockAdminUser },
      );

      const firstNameInput = screen.getByLabelText(/first name/i);
      fireEvent.change(firstNameInput, { target: { value: '' } });

      const saveBtn = screen.getByRole('button', { name: /save changes/i });
      fireEvent.click(saveBtn);

      const summaryHeading = await screen.findByText(/please fix the following errors/i);
      expect(summaryHeading).toBeInTheDocument();

      const firstNameLink = screen.getByTestId('validation-summary-item-firstName');
      fireEvent.click(firstNameLink);
      expect(firstNameInput).toHaveFocus();
    });

    it('preserves form field values upon recoverable server conflict rejection', async () => {
      const mockConflictSubmit = jest.fn().mockRejectedValue({
        statusCode: 409,
        message: 'An active client with this email address already exists.',
      });

      renderWithProviders(
        <ClientRegistrationForm onSubmit={mockConflictSubmit} onSuccess={jest.fn()} />,
        { initialSessionOverride: mockAdminUser },
      );

      const firstNameInput = screen.getByTestId('first-name-input');
      const lastNameInput = screen.getByTestId('last-name-input');
      const emailInput = screen.getByTestId('email-input');
      const phoneInput = screen.getByTestId('phone-input');

      fireEvent.change(firstNameInput, { target: { value: 'Eleanor' } });
      fireEvent.change(lastNameInput, { target: { value: 'Rigby' } });
      fireEvent.change(emailInput, { target: { value: 'eleanor@example.com' } });
      fireEvent.change(phoneInput, { target: { value: '+1 555-987-6543' } });

      fireEvent.click(screen.getByRole('button', { name: /register client/i }));

      // Wait for server error alert
      await screen.findByText(/duplicate conflict/i);

      // Field values remain intact and recoverable
      expect(firstNameInput).toHaveValue('Eleanor');
      expect(lastNameInput).toHaveValue('Rigby');
      expect(emailInput).toHaveValue('eleanor@example.com');
      expect(phoneInput).toHaveValue('+1 555-987-6543');
    });
  });

  describe('4. Status Indicators, Contrast & Non-Color Semantics', () => {
    it('status badges render text and icons without relying solely on color', () => {
      const { rerender } = renderWithProviders(<ClientStatusBadge status="ACTIVE" />);
      const activeBadge = screen.getByLabelText('Client status: Active');
      expect(activeBadge).toHaveTextContent('Active');
      expect(activeBadge.querySelector('svg')).toBeInTheDocument();

      rerender(<ClientStatusBadge status="ARCHIVED" />);
      const archivedBadge = screen.getByLabelText('Client status: Archived');
      expect(archivedBadge).toHaveTextContent('Archived');
      expect(archivedBadge.querySelector('svg')).toBeInTheDocument();
    });

    it('DataTablePagination uses semantic navigation landmark', () => {
      renderWithProviders(
        <ClientListTable
          clients={[mockClient]}
          totalCount={25}
          page={1}
          pageSize={10}
          onPageChange={jest.fn()}
        />,
      );

      const paginationNav = screen.getByRole('navigation', { name: /table pagination/i });
      expect(paginationNav).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /go to next page/i })).toBeEnabled();
      expect(screen.getByRole('button', { name: /go to previous page/i })).toBeDisabled();
    });
  });
});
