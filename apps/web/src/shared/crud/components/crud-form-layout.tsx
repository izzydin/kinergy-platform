import * as React from 'react';
import type { CrudFormLayoutProps } from '../types/crud-form.types';

const MAX_WIDTH_MAP = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  full: 'max-w-full',
} as const;

export const CrudFormLayout: React.FC<CrudFormLayoutProps> = ({
  header,
  alerts,
  children,
  maxWidth = '2xl',
  className = '',
}) => {
  const maxWidthClass = MAX_WIDTH_MAP[maxWidth] ?? 'max-w-2xl';

  return (
    <div className={`container mx-auto px-4 py-6 ${maxWidthClass} space-y-6 ${className}`}>
      {header}
      {alerts && <div className="space-y-3">{alerts}</div>}
      {children}
    </div>
  );
};

CrudFormLayout.displayName = 'CrudFormLayout';
