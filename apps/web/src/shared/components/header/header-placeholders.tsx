import { ChevronRight, User } from 'lucide-react';
import React from 'react';
import type { HeaderPlaceholderProps } from './header.types';

/**
 * User Menu Avatar Placeholder Slot
 * Presentation-only placeholder for future identity context & profile dropdown menu.
 */
export const UserMenuPlaceholder: React.FC<HeaderPlaceholderProps> = ({ className = '' }) => {
  return (
    <button
      type="button"
      className={`flex items-center gap-2 rounded-xl border border-border/60 bg-card/40 p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
      aria-label="User Account Menu Placeholder"
    >
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-xs">
        <User className="h-4 w-4" />
      </div>
      <span className="hidden md:inline-block text-xs font-medium text-foreground">
        Account Placeholder
      </span>
    </button>
  );
};

/**
 * Breadcrumb Path Placeholder Slot
 * Presentation-only placeholder for dynamic route breadcrumbs.
 */
export const BreadcrumbsPlaceholder: React.FC<HeaderPlaceholderProps> = ({ className = '' }) => {
  return (
    <nav
      aria-label="Breadcrumbs Placeholder"
      className={`flex items-center gap-1.5 text-xs text-muted-foreground font-medium ${className}`}
    >
      <span className="hover:text-foreground transition-colors">Platform</span>
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
      <span className="text-foreground font-semibold">Dashboard</span>
    </nav>
  );
};
