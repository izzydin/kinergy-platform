import React from 'react';
import { SlotTarget } from '../../ui/slots';
import { BreadcrumbsPlaceholder } from './header-placeholders';
import { UserMenu } from './user-menu';
import type { HeaderProps } from './header.types';

/**
 * Application Header Component
 *
 * Presentation-only layout shell exposing predefined `<SlotTarget />` insertion points:
 * - `header-breadcrumbs` (Left slot)
 * - `header-actions` (Right slot)
 *
 * Feature modules inject UI declaratively using `<SlotInject target="...">`.
 * The Header shell remains 100% unaware of business domain components.
 */
export const Header: React.FC<HeaderProps> = ({
  breadcrumbs = <BreadcrumbsPlaceholder />,
  userMenu = <UserMenu />,
  extra,
  className = '',
}) => {
  return (
    <header
      className={`sticky top-0 z-30 flex h-16 w-full items-center justify-between gap-4 border-b border-border/50 bg-background/80 pl-14 pr-4 md:px-6 backdrop-blur-md transition-colors ${className}`}
      role="banner"
    >
      {/* Left Slot Target: Dynamic Breadcrumb Navigation */}
      <SlotTarget name="header-breadcrumbs" className="flex flex-1 items-center gap-4 min-w-0">
        {breadcrumbs}
      </SlotTarget>

      {/* Right Toolbar Area: Contextual Actions & User Account Menu */}
      <div className="flex shrink-0 items-center gap-2 md:gap-3">
        <SlotTarget name="header-actions" className="flex items-center gap-2 md:gap-3">
          {extra}
        </SlotTarget>
        {userMenu}
      </div>
    </header>
  );
};
