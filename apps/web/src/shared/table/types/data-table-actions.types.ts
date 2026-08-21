import type React from 'react';

/**
 * DataTable Row Action Contracts
 *
 * Enforces Track C — Step C2.4 Column Visibility & Action Menus Architecture:
 * Reusable, accessible, and domain-agnostic row actions.
 */

export interface DataTableRowAction<TData> {
  /** Unique action identifier */
  readonly id: string;
  /** Visible action label */
  readonly label: string;
  /** Optional icon component */
  readonly icon?: React.ComponentType<{ readonly className?: string }>;
  /** Callback fired when the action is executed with the current row data */
  readonly onClick: (row: TData) => void;
  /** Whether the action is disabled */
  readonly disabled?: boolean;
  /** Whether the action performs a destructive operation (styled with destructive token) */
  readonly isDestructive?: boolean;
  /** Whether the action should be hidden from the menu */
  readonly hidden?: boolean;
}

export interface DataTableRowActionsProps<TData> {
  /** Row data entity */
  readonly row: TData;
  /** Array of feature-provided row actions */
  readonly actions: readonly DataTableRowAction<TData>[];
  /** Accessible label for the action trigger button (default: 'Open actions menu') */
  readonly triggerLabel?: string;
  /** Custom trigger button className */
  readonly className?: string;
}
