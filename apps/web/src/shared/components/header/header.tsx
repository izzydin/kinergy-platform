import React from 'react';
import { SlotTarget } from '../../ui/slots';
import {
  BreadcrumbsPlaceholder,
  NotificationsPlaceholder,
  SearchPlaceholder,
} from './header-placeholders';
import { UserMenu } from './user-menu';
import type { HeaderProps } from './header.types';

/**
 * Application Header Component
 *
 * Presentation-only layout shell exposing predefined `<SlotTarget />` insertion points:
 * - `header-breadcrumbs` (Left slot)
 * - `header-search` (Center slot)
 * - `header-actions` (Right slot)
 *
 * Feature modules inject UI declaratively using `<SlotInject target="...">`.
 * The Header shell remains 100% unaware of business domain components.
 */
export const Header: React.FC<HeaderProps> = ({
  breadcrumbs = <BreadcrumbsPlaceholder />,
  search = <SearchPlaceholder />,
  notifications = <NotificationsPlaceholder />,
  userMenu = <UserMenu />,
  extra,
  className = '',
}) => {
  return (
    <header
      className={`sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-border/50 bg-background/80 pl-14 pr-4 md:px-6 backdrop-blur-md transition-colors ${className}`}
      role="banner"
    >
      {/* Left Slot Target: Dynamic Breadcrumb Navigation */}
      <SlotTarget name="header-breadcrumbs" className="flex items-center gap-4 min-w-0">
        {breadcrumbs}
      </SlotTarget>

      {/* Center Slot Target: Global Search Input */}
      <SlotTarget
        name="header-search"
        className="hidden md:flex items-center justify-center flex-1 max-w-md mx-4"
      >
        {search}
      </SlotTarget>

      {/* Right Toolbar Area: Contextual Actions, Notifications & User Account Menu */}
      <div className="flex items-center gap-2 md:gap-3">
        <SlotTarget name="header-actions" className="flex items-center gap-2 md:gap-3">
          {notifications}
          {extra}
        </SlotTarget>
        {userMenu}
      </div>
    </header>
  );
};
