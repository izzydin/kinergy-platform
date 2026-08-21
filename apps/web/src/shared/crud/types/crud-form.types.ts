import type { ReactNode } from 'react';

/**
 * Props for the standard CRUD Form Page Header
 */
export interface CrudFormHeaderProps {
  /** Primary form/page title (e.g. 'Create User Account', 'Edit Membership Plan') */
  readonly title: string;
  /** Subtitle or instructions */
  readonly description?: string;
  /** Optional back navigation link metadata */
  readonly backLink?: {
    readonly href?: string;
    readonly label?: string;
    readonly onBack?: () => void;
  };
  /** Optional status badge */
  readonly badge?: ReactNode;
  /** Custom CSS class names */
  readonly className?: string;
}

/**
 * Props for the standard CRUD Form Layout Container
 */
export interface CrudFormLayoutProps {
  /** Form page header */
  readonly header?: ReactNode;
  /** Optional top-level alert or validation summary */
  readonly alerts?: ReactNode;
  /** Main form fields/sections content */
  readonly children: ReactNode;
  /** Maximum width constraint (defaults to '2xl' / max-w-2xl) */
  readonly maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'full';
  /** Custom CSS class names */
  readonly className?: string;
}
