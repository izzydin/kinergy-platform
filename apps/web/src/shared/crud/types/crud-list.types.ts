import type { ReactNode } from 'react';
import type { SlotTargetName } from '../../ui/slots/slot.types';

/**
 * Props for the standard CRUD List Page Header
 */
export interface CrudListHeaderProps {
  /** Primary page title */
  readonly title: string;
  /** Explanatory subtitle or description */
  readonly description?: string;
  /** Primary action button(s) (e.g. '+ Create User') */
  readonly action?: ReactNode;
  /** Optional status or metric badge rendered next to title */
  readonly badge?: ReactNode;
  /** If specified, additionally projects the action into a shell slot target (e.g. 'header-actions') */
  readonly slotTarget?: SlotTargetName;
  /** Custom CSS class names */
  readonly className?: string;
}

/**
 * Props for the standard CRUD List Page Container Layout
 */
export interface CrudListLayoutProps {
  /** Header element or configuration */
  readonly header?: ReactNode;
  /** Search and faceted filter toolbar */
  readonly toolbar?: ReactNode;
  /** Main list content (DataTable, StateView, etc.) */
  readonly children: ReactNode;
  /** Custom CSS class names */
  readonly className?: string;
}
