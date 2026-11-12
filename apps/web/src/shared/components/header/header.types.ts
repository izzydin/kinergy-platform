import React from 'react';

export interface HeaderProps {
  /** Slot for dynamic breadcrumb navigation bar */
  breadcrumbs?: React.ReactNode;
  /** Slot for user profile menu / account dropdown */
  userMenu?: React.ReactNode;
  /** Slot for additional custom header widgets (system status, theme toggle, tenant switcher) */
  extra?: React.ReactNode;
  /** Additional CSS class names */
  className?: string;
}

export interface HeaderPlaceholderProps {
  className?: string;
}
