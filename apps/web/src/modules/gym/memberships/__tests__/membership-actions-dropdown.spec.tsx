import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { MembershipListTable } from '../components/membership-list-table';
import type { MembershipVM } from '../types';

const createMockMembership = (overrides: Partial<MembershipVM> = {}): MembershipVM => ({
  id: 'mem_1',
  clientId: 'cli_user_1',
  planId: 'plan_std_pass',
  status: 'ACTIVE',
  period: {
    startDate: '2026-08-01T00:00:00.000Z',
    endDate: '2026-08-31T00:00:00.000Z',
    durationDays: 30,
  },
  version: 1,
  freezeHistory: [],
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  ...overrides,
});

describe('Gym Memberships Actions Dropdown & Clipping Prevention', () => {
  const handleView = jest.fn();
  const handleRenew = jest.fn();
  const handleFreeze = jest.fn();
  const handleUnfreeze = jest.fn();
  const handleCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all expected actions for an ACTIVE membership', () => {
    const activeMem = createMockMembership({ id: 'mem_active', status: 'ACTIVE' });

    render(
      <MembershipListTable
        memberships={[activeMem]}
        onViewDetails={handleView}
        onRenew={handleRenew}
        onFreeze={handleFreeze}
        onUnfreeze={handleUnfreeze}
        onCancel={handleCancel}
      />,
    );

    const triggerBtn = screen.getByRole('button', { name: /open actions menu/i });
    fireEvent.click(triggerBtn);

    const menu = screen.getByRole('menu');
    expect(menu).toBeInTheDocument();

    // Verify all active options are visible in the dropdown
    expect(screen.getByRole('menuitem', { name: /view details/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /renew agreement/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /freeze \/ suspend/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /cancel agreement/i })).toBeInTheDocument();

    // Resume / Unfreeze is hidden for active status
    expect(screen.queryByRole('menuitem', { name: /resume \/ unfreeze/i })).not.toBeInTheDocument();
  });

  it('renders all expected actions for a FROZEN membership', () => {
    const frozenMem = createMockMembership({ id: 'mem_frozen', status: 'FROZEN' });

    render(
      <MembershipListTable
        memberships={[frozenMem]}
        onViewDetails={handleView}
        onRenew={handleRenew}
        onFreeze={handleFreeze}
        onUnfreeze={handleUnfreeze}
        onCancel={handleCancel}
      />,
    );

    const triggerBtn = screen.getByRole('button', { name: /open actions menu/i });
    fireEvent.click(triggerBtn);

    expect(screen.getByRole('menuitem', { name: /view details/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /renew agreement/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /resume \/ unfreeze/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /cancel agreement/i })).toBeInTheDocument();

    // Freeze is hidden for already frozen status
    expect(screen.queryByRole('menuitem', { name: /freeze \/ suspend/i })).not.toBeInTheDocument();
  });

  it('renders actions through a portal escaping table container clipping on the last row', () => {
    const memberships = Array.from({ length: 8 }, (_, i) =>
      createMockMembership({ id: `mem_${i + 1}`, clientId: `cli_${i + 1}` }),
    );

    const { container } = render(
      <MembershipListTable
        memberships={memberships}
        onViewDetails={handleView}
        onRenew={handleRenew}
        onFreeze={handleFreeze}
        onUnfreeze={handleUnfreeze}
        onCancel={handleCancel}
      />,
    );

    // Identify the last row's action trigger button
    const actionButtons = screen.getAllByRole('button', { name: /open actions menu/i });
    expect(actionButtons).toHaveLength(8);
    const lastRowTrigger = actionButtons[7]!;

    fireEvent.click(lastRowTrigger);

    const menu = screen.getByRole('menu');
    expect(menu).toBeInTheDocument();

    // Verify all 4 actions are present and accessible for this row
    expect(screen.getByRole('menuitem', { name: /view details/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /renew agreement/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /freeze \/ suspend/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /cancel agreement/i })).toBeInTheDocument();

    // Check that menu is rendered in document.body (portal), NOT inside the table's overflow container
    const tableContainer = container.querySelector('.overflow-x-auto');
    expect(tableContainer).not.toBeNull();
    expect(tableContainer).not.toContainElement(menu);
    expect(document.body).toContainElement(menu);
  });

  it('automatically flips and repositions above the trigger when opened near viewport bottom', () => {
    const memberships = Array.from({ length: 10 }, (_, i) =>
      createMockMembership({ id: `mem_${i + 1}`, clientId: `cli_${i + 1}` }),
    );

    render(
      <MembershipListTable
        memberships={memberships}
        onViewDetails={handleView}
        onRenew={handleRenew}
        onFreeze={handleFreeze}
        onUnfreeze={handleUnfreeze}
        onCancel={handleCancel}
      />,
    );

    const actionButtons = screen.getAllByRole('button', { name: /open actions menu/i });
    const lastRowTrigger = actionButtons[9]!;

    // Set viewport: 800px high. Trigger near bottom at top: 740px, bottom: 772px
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 800,
    });
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });

    jest.spyOn(lastRowTrigger, 'getBoundingClientRect').mockReturnValue({
      top: 740,
      bottom: 772,
      left: 850,
      right: 882,
      width: 32,
      height: 32,
      x: 850,
      y: 740,
      toJSON: () => ({}),
    });

    fireEvent.click(lastRowTrigger);

    const menu = screen.getByRole('menu');
    // Dropdown must automatically reposition above the trigger
    expect(menu).toHaveAttribute('data-placement', 'top');
    expect(menu.style.bottom).not.toBe('');
    expect(menu.style.bottom).not.toBe('auto');

    // All options remain completely accessible
    const cancelOption = screen.getByRole('menuitem', { name: /cancel agreement/i });
    expect(cancelOption).toBeInTheDocument();

    // Selecting an option triggers its callback with the last row's entity
    fireEvent.click(cancelOption);
    expect(handleCancel).toHaveBeenCalledTimes(1);
    expect(handleCancel).toHaveBeenCalledWith(memberships[9]);
  });

  it('respects canManageMemberships=false permission restrictions', () => {
    const activeMem = createMockMembership({ id: 'mem_active', status: 'ACTIVE' });

    render(
      <MembershipListTable
        memberships={[activeMem]}
        canManageMemberships={false}
        onViewDetails={handleView}
        onRenew={handleRenew}
        onFreeze={handleFreeze}
        onUnfreeze={handleUnfreeze}
        onCancel={handleCancel}
      />,
    );

    const triggerBtn = screen.getByRole('button', { name: /open actions menu/i });
    fireEvent.click(triggerBtn);

    // View is accessible
    const viewItem = screen.getByRole('menuitem', { name: /view details/i });
    expect(viewItem).not.toBeDisabled();

    // Management actions are disabled
    const renewItem = screen.getByRole('menuitem', { name: /renew agreement/i });
    const freezeItem = screen.getByRole('menuitem', { name: /freeze \/ suspend/i });
    const cancelItem = screen.getByRole('menuitem', { name: /cancel agreement/i });

    expect(renewItem).toBeDisabled();
    expect(freezeItem).toBeDisabled();
    expect(cancelItem).toBeDisabled();

    fireEvent.click(cancelItem);
    expect(handleCancel).not.toHaveBeenCalled();
  });

  it('manages keyboard navigation and Escape dismissal', () => {
    const activeMem = createMockMembership({ id: 'mem_active', status: 'ACTIVE' });

    render(
      <MembershipListTable
        memberships={[activeMem]}
        onViewDetails={handleView}
        onRenew={handleRenew}
        onFreeze={handleFreeze}
        onUnfreeze={handleUnfreeze}
        onCancel={handleCancel}
      />,
    );

    const triggerBtn = screen.getByRole('button', { name: /open actions menu/i });
    fireEvent.keyDown(triggerBtn, { key: 'ArrowDown' });

    const menu = screen.getByRole('menu');
    expect(menu).toBeInTheDocument();

    // First item focused
    const viewItem = screen.getByRole('menuitem', { name: /view details/i });
    expect(viewItem).toHaveFocus();

    // Navigate to next
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    const renewItem = screen.getByRole('menuitem', { name: /renew agreement/i });
    expect(renewItem).toHaveFocus();

    // Escape closes and restores focus to trigger button
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('renders Client Name column alongside Client ID in table headers and rows', () => {
    const memWithName = createMockMembership({
      id: 'mem_with_name',
      clientId: 'cli_carlos_01',
      clientName: 'Carlos Rivera',
    });

    render(<MembershipListTable memberships={[memWithName]} />);

    // Verify column headers exist
    expect(screen.getByRole('columnheader', { name: /client name/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /client id/i })).toBeInTheDocument();

    // Verify client name and client ID both render in row
    expect(screen.getByText('Carlos Rivera')).toBeInTheDocument();
    expect(screen.getByText('cli_carlos_01')).toBeInTheDocument();
  });
});
