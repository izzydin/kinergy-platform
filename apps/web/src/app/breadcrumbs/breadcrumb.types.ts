import React from 'react';

export interface BreadcrumbItem {
  id: string;
  label: string;
  path?: string;
  isCurrent: boolean;
  icon?: React.ComponentType<{ className?: string }> | string;
}

export type BreadcrumbResolver = string | ((params: Record<string, string | undefined>) => string);

export interface RouteBreadcrumbHandle {
  breadcrumb: BreadcrumbResolver;
  icon?: React.ComponentType<{ className?: string }> | string;
}

export interface BreadcrumbContextState {
  breadcrumbs: BreadcrumbItem[];
  setCustomBreadcrumbs: (items: BreadcrumbItem[] | null) => void;
}
