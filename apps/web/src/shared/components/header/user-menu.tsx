import { LogOut, Shield, User as UserIcon } from 'lucide-react';
import React, { useCallback, useRef, useState } from 'react';
import { useAuth } from '../../../app/providers/auth-provider';
import { Avatar, AvatarFallback, Badge, Spinner } from '@kinergy-platform/ui';

export interface UserMenuProps {
  readonly className?: string;
}

/**
 * Calculates display initials deterministically from name or email.
 * - "Lead Architect" -> "LA"
 * - "Architect" -> "AR"
 * - null/empty name + "architect@kinergy.io" -> "AR"
 */
export function getUserInitials(name?: string | null, email?: string | null): string {
  const trimmedName = name?.trim();
  if (trimmedName) {
    const parts = trimmedName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const first = parts[0]?.charAt(0) ?? '';
      const last = parts[parts.length - 1]?.charAt(0) ?? '';
      const combined = (first + last).toUpperCase();
      if (combined) return combined;
    }
    if (parts.length === 1 && parts[0]) {
      return parts[0].substring(0, 2).toUpperCase();
    }
  }

  const trimmedEmail = email?.trim();
  if (trimmedEmail) {
    const emailPrefix = trimmedEmail.split('@')[0] ?? '';
    if (emailPrefix.length >= 2) {
      return emailPrefix.substring(0, 2).toUpperCase();
    }
    if (emailPrefix.length === 1) {
      return emailPrefix.toUpperCase();
    }
  }

  return 'U';
}

/**
 * User Profile & Account Dropdown Menu Component
 *
 * Implements Track B — Step B4.1 Dashboard Authentication Integration:
 * - Consumes canonical `useAuth().currentUser` source of truth.
 * - Displays `displayName` (with email fallback), `email`, and `roles[0]` primary role badge.
 * - Uses A4 Design System `<Avatar />`, `<AvatarImage />`, `<AvatarFallback />` primitives.
 * - Implements accessible ARIA dropdown semantics (role="menu", role="menuitem", aria-expanded).
 * - Executes reactive logout without manual router navigation.
 */
export const UserMenu: React.FC<UserMenuProps> = ({ className = '' }) => {
  const { currentUser, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const toggleMenu = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      setIsLoggingOut(true);
      await logout();
    } catch {
      // AuthProvider safely forces local session clear on logout rejection
    } finally {
      setIsLoggingOut(false);
      closeMenu();
    }
  }, [logout, closeMenu]);

  // Handle keyboard escape key press
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    },
    [closeMenu],
  );

  if (!currentUser) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Avatar className="h-8 w-8 animate-pulse rounded-xl bg-muted/60">
          <AvatarFallback className="rounded-xl bg-muted/60 text-xs">U</AvatarFallback>
        </Avatar>
      </div>
    );
  }

  const displayName = currentUser.name?.trim() || currentUser.email || 'Authenticated User';
  const initials = getUserInitials(currentUser.name, currentUser.email);
  const primaryRole = currentUser.roles[0] || 'USER';

  return (
    <div
      ref={menuRef}
      className={`relative inline-block text-left ${className}`}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger Button */}
      <button
        type="button"
        onClick={toggleMenu}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={`User account menu for ${displayName}`}
        className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/50 p-1.5 text-muted-foreground transition-all hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Avatar className="h-7 w-7 rounded-lg">
          <AvatarFallback className="rounded-lg bg-primary/10 font-bold text-primary text-xs shadow-sm">
            {initials}
          </AvatarFallback>
        </Avatar>
        <span className="hidden text-xs font-semibold text-foreground md:inline-block max-w-[120px] truncate">
          {displayName}
        </span>
      </button>

      {/* Dropdown Menu Panel */}
      {isOpen && (
        <>
          {/* Backdrop click dismiss */}
          <div
            className="fixed inset-0 z-40 bg-transparent"
            onClick={closeMenu}
            aria-hidden="true"
          />

          <div
            role="menu"
            aria-orientation="vertical"
            className="absolute right-0 z-50 mt-2 w-64 origin-top-right rounded-2xl border border-border/70 bg-popover/95 p-3 text-popover-foreground shadow-xl backdrop-blur-xl transition-all focus:outline-none"
          >
            {/* Header: Identity Info */}
            <div className="flex items-center gap-3 border-b border-border/50 pb-3 px-1">
              <Avatar className="h-10 w-10 shrink-0 rounded-xl">
                <AvatarFallback className="rounded-xl bg-primary/15 font-extrabold text-primary text-sm shadow-inner">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="font-bold text-sm text-foreground truncate">{displayName}</span>
                <span className="text-xs text-muted-foreground truncate">{currentUser.email}</span>
                <div className="mt-1 flex items-center gap-1.5">
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-semibold">
                    <Shield className="mr-1 h-3 w-3 text-primary" />
                    {primaryRole}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Menu Items */}
            <div className="pt-2 space-y-1">
              <div
                role="menuitem"
                tabIndex={0}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer"
                onClick={closeMenu}
              >
                <UserIcon className="h-4 w-4 text-muted-foreground/70" />
                <span>Account Overview</span>
              </div>

              {/* Logout Action */}
              <button
                type="button"
                role="menuitem"
                disabled={isLoggingOut}
                onClick={() => void handleLogout()}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                {isLoggingOut ? (
                  <Spinner size="sm" className="h-4 w-4" />
                ) : (
                  <LogOut className="h-4 w-4" />
                )}
                <span>{isLoggingOut ? 'Signing out...' : 'Sign Out'}</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
