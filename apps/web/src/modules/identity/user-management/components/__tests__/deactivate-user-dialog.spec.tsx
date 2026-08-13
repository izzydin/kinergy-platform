import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ManagedUser } from '../../domain/user.types';
import { DeactivateUserDialog } from '../deactivate-user-dialog';

const MOCK_ACTIVE_USER: ManagedUser = {
  id: 'usr_active_123',
  email: 'admin@kinergy.io',
  name: 'Platform Admin',
  status: 'ACTIVE',
  roles: ['ADMIN'],
  permissions: ['manage:users'],
  tenantId: 'tenant_kinergy_master',
  lastLoginAt: '2026-08-01T10:00:00Z',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-08-01T10:00:00Z',
};

describe('DeactivateUserDialog Component', () => {
  const handleOpenChange = jest.fn();
  const handleConfirm = jest.fn();

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders null when user prop is null', () => {
    const { container } = render(
      <DeactivateUserDialog
        user={null}
        open={true}
        onOpenChange={handleOpenChange}
        onConfirm={handleConfirm}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders confirmation title, user target name, and security notice when open', () => {
    render(
      <DeactivateUserDialog
        user={MOCK_ACTIVE_USER}
        open={true}
        onOpenChange={handleOpenChange}
        onConfirm={handleConfirm}
      />,
    );

    expect(screen.getByRole('heading', { name: /deactivate user account/i })).toBeInTheDocument();
    expect(screen.getByText('Platform Admin')).toBeInTheDocument();
    expect(screen.getByText(/admin@kinergy.io/i)).toBeInTheDocument();
    expect(screen.getByText(/security notice:/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /deactivate user/i })).toBeInTheDocument();
  });

  it('invokes onConfirm callback with user when Deactivate button is clicked', () => {
    render(
      <DeactivateUserDialog
        user={MOCK_ACTIVE_USER}
        open={true}
        onOpenChange={handleOpenChange}
        onConfirm={handleConfirm}
      />,
    );

    const deactivateBtn = screen.getByRole('button', { name: /deactivate user/i });
    fireEvent.click(deactivateBtn);

    expect(handleConfirm).toHaveBeenCalledWith(MOCK_ACTIVE_USER);
  });

  it('closes dialog when Cancel button is clicked without invoking onConfirm', () => {
    render(
      <DeactivateUserDialog
        user={MOCK_ACTIVE_USER}
        open={true}
        onOpenChange={handleOpenChange}
        onConfirm={handleConfirm}
      />,
    );

    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelBtn);

    expect(handleOpenChange).toHaveBeenCalledWith(false);
    expect(handleConfirm).not.toHaveBeenCalled();
  });

  it('disables action buttons while isDeactivating is true', () => {
    render(
      <DeactivateUserDialog
        user={MOCK_ACTIVE_USER}
        open={true}
        onOpenChange={handleOpenChange}
        onConfirm={handleConfirm}
        isDeactivating={true}
      />,
    );

    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /deactivating.../i })).toBeDisabled();
  });
});
