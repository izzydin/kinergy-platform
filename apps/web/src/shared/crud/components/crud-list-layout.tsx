import * as React from 'react';
import type { CrudListLayoutProps } from '../types/crud-list.types';

export const CrudListLayout: React.FC<CrudListLayoutProps> = ({
  header,
  toolbar,
  children,
  className = '',
}) => {
  return (
    <div className={`container mx-auto px-4 py-6 max-w-7xl space-y-6 ${className}`}>
      {header}
      {toolbar}
      {children}
    </div>
  );
};

CrudListLayout.displayName = 'CrudListLayout';
