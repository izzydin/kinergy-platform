import React from 'react';
import {
  BreadcrumbsPlaceholder,
  NotificationsPlaceholder,
  SearchPlaceholder,
  UserMenuPlaceholder,
} from './header-placeholders';
import type { HeaderProps } from './header.types';

/**
 * Application Header Component
 *
 * Presentation-only layout shell exposing extension slots for future modules:
 * - Breadcrumbs slot (`breadcrumbs`)
 * - Global search slot (`search`)
 * - Notifications drawer trigger slot (`notifications`)
 * - User account menu slot (`userMenu`)
 * - Extra custom action widgets slot (`extra`)
 *
 * Rules:
 * - Zero authentication logic
 * - Zero business domain logic
 * - Strictly presentation & slot composition
 */
export const Header: React.FC<HeaderProps> = ({
  breadcrumbs = <BreadcrumbsPlaceholder />,
  search = <SearchPlaceholder />,
  notifications = <NotificationsPlaceholder />,
  userMenu = <UserMenuPlaceholder />,
  extra,
  className = '',
}) => {
  return (
    <header
      className={`sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-border/50 bg-background/80 px-4 md:px-6 backdrop-blur-md transition-colors ${className}`}
      role="banner"
    >
      {/* Left Slot: Dynamic Breadcrumb Navigation */}
      <div className="flex items-center gap-4 min-w-0">{breadcrumbs}</div>

      {/* Center Slot: Global Search Input */}
      <div className="hidden md:flex items-center justify-center flex-1 max-w-md mx-4">
        {search}
      </div>

      {/* Right Slot: Actions, Notifications, User Profile & Extras */}
      <div className="flex items-center gap-2 md:gap-3">
        {notifications}
        {userMenu}
        {extra}
      </div>
    </header>
  );
};
