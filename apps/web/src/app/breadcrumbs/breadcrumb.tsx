import { ChevronRight } from 'lucide-react';
import React from 'react';
import { Link } from 'react-router-dom';
import { useBreadcrumbs } from './breadcrumb-provider';
import type { BreadcrumbItem } from './breadcrumb.types';

export interface BreadcrumbProps {
  /** Optional custom CSS classes */
  className?: string;
  /** Maximum items to display before collapsing intermediate items */
  maxItems?: number;
}

/**
 * Accessible Breadcrumb Visual Component
 *
 * Renders auto-generated route breadcrumbs from `useBreadcrumbs()`.
 */
export const Breadcrumb: React.FC<BreadcrumbProps> = ({ className = '', maxItems = 4 }) => {
  const { breadcrumbs } = useBreadcrumbs();

  if (!breadcrumbs || breadcrumbs.length === 0) {
    return null;
  }

  // Display truncated list if breadcrumb length exceeds maxItems
  const firstItem = breadcrumbs[0];
  const lastItems = breadcrumbs.slice(-2);

  const displayItems: BreadcrumbItem[] =
    breadcrumbs.length > maxItems && firstItem
      ? [firstItem, { id: 'ellipsis', label: '...', isCurrent: false }, ...lastItems]
      : breadcrumbs;

  return (
    <nav aria-label="Breadcrumb Navigation" className={`flex items-center text-xs ${className}`}>
      <ol className="flex items-center flex-wrap gap-1.5 font-medium">
        {displayItems.map((item, index) => {
          if (!item) return null;

          const isLast = index === displayItems.length - 1;
          const IconComponent = typeof item.icon === 'function' ? item.icon : undefined;

          return (
            <li key={item.id} className="inline-flex items-center gap-1.5">
              {index > 0 && (
                <ChevronRight
                  className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0"
                  aria-hidden="true"
                />
              )}

              {item.isCurrent || isLast || !item.path ? (
                <span
                  aria-current={item.isCurrent ? 'page' : undefined}
                  className={`flex items-center gap-1 truncate ${
                    item.isCurrent ? 'text-foreground font-semibold' : 'text-muted-foreground'
                  }`}
                >
                  {IconComponent && <IconComponent className="h-3.5 w-3.5 shrink-0" />}
                  <span>{item.label}</span>
                </span>
              ) : (
                <Link
                  to={item.path}
                  className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1"
                >
                  {IconComponent && <IconComponent className="h-3.5 w-3.5 shrink-0" />}
                  <span>{item.label}</span>
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
