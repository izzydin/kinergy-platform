import { Bell, ChevronRight, Search, User } from 'lucide-react';
import React from 'react';
import type { HeaderPlaceholderProps } from './header.types';

/**
 * Global Search Bar Placeholder Slot
 * Presentation-only placeholder for future global command palette / search module.
 */
export const SearchPlaceholder: React.FC<HeaderPlaceholderProps> = ({ className = '' }) => {
  return (
    <div
      className={`relative flex items-center w-64 md:w-80 h-9 rounded-xl border border-border/60 bg-muted/30 px-3 text-muted-foreground text-sm transition-colors hover:bg-muted/50 focus-within:ring-2 focus-within:ring-ring ${className}`}
      role="search"
      aria-label="Global Search Placeholder"
    >
      <Search className="h-4 w-4 shrink-0 mr-2 text-muted-foreground/70" />
      <span className="flex-1 truncate text-xs">Search platform...</span>
      <kbd className="hidden md:inline-flex items-center rounded border border-border bg-background px-1.5 font-mono text-[10px] text-muted-foreground font-semibold">
        ⌘K
      </kbd>
    </div>
  );
};

/**
 * Notifications Bell Placeholder Slot
 * Presentation-only placeholder for future real-time notification drawer.
 */
export const NotificationsPlaceholder: React.FC<HeaderPlaceholderProps> = ({ className = '' }) => {
  return (
    <button
      type="button"
      className={`relative flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-card/40 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
      aria-label="Notifications Placeholder"
    >
      <Bell className="h-4 w-4" />
      <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary animate-pulse" />
    </button>
  );
};

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
