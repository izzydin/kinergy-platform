import { ChevronLeft, ChevronRight, Menu, X, Zap } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useNavigation } from '../../../app/navigation';
import type { NavigationItem } from '../../../app/navigation/navigation.types';

export interface SidebarProps {
  /** Optional brand title header slot */
  brandTitle?: string;
  /** Optional custom sidebar footer content slot */
  footer?: React.ReactNode;
  /** Additional CSS class names */
  className?: string;
}

/**
 * Accessible, Responsive, Configuration-Driven Sidebar Component
 *
 * Consumes the Navigation Framework (`useNavigation()`) dynamically to render sectioned,
 * permission-aware navigation links without hardcoding business module menu entries.
 *
 * Responsive Features (Milestone A3.6):
 * - Desktop: Smooth width collapse (256px expanded <-> 80px collapsed) with `Ctrl+B` shortcut
 * - Mobile (< md): Slide-over overlay drawer with backdrop blur overlay and body scroll locking
 * - Keyboard Accessibility: `Escape` key close handler, focus management & trap focus restoration
 * - WAI-ARIA Standards: `role="navigation"`, `aria-current="page"`, `aria-expanded`, `aria-label`
 */
export const Sidebar: React.FC<SidebarProps> = ({
  brandTitle = 'Kinergy',
  footer,
  className = '',
}) => {
  const location = useLocation();
  const { sections } = useNavigation();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // References for focus management
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileCloseButtonRef = useRef<HTMLButtonElement>(null);

  // Close mobile sidebar automatically upon route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

  // Lock body scroll when mobile drawer overlay is open
  useEffect(() => {
    if (isMobileOpen) {
      document.body.style.overflow = 'hidden';
      // Move focus into the mobile close button when opened
      setTimeout(() => mobileCloseButtonRef.current?.focus(), 50);
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileOpen]);

  // Keyboard accessibility listeners (Escape key to close, Ctrl+B / Cmd+B to toggle collapse)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Escape key closes mobile navigation drawer
      if (event.key === 'Escape' && isMobileOpen) {
        setIsMobileOpen(false);
        mobileTriggerRef.current?.focus();
      }

      // Ctrl+B or Cmd+B toggles desktop sidebar collapse
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        setIsCollapsed((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileOpen]);

  const toggleCollapse = () => setIsCollapsed((prev) => !prev);
  const toggleMobile = () => setIsMobileOpen((prev) => !prev);

  const isItemActive = (item: NavigationItem): boolean => {
    return item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path);
  };

  return (
    <>
      {/* Mobile Trigger Button (< md breakpoint) */}
      <button
        ref={mobileTriggerRef}
        type="button"
        onClick={toggleMobile}
        className="fixed top-3 left-3 z-50 flex h-10 w-10 items-center justify-center rounded-xl border border-border/80 bg-background/90 text-foreground shadow-lg backdrop-blur-md md:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={isMobileOpen ? 'Close Navigation Drawer' : 'Open Navigation Drawer'}
        aria-expanded={isMobileOpen}
        aria-controls="main-sidebar-drawer"
      >
        {isMobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Mobile Backdrop Overlay (< md breakpoint) */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm transition-opacity duration-300 md:hidden"
          onClick={() => {
            setIsMobileOpen(false);
            mobileTriggerRef.current?.focus();
          }}
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar Element */}
      <aside
        id="main-sidebar-drawer"
        aria-label="Main Navigation"
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border/50 bg-card/70 backdrop-blur-xl transition-all duration-300 ease-in-out md:static ${
          isMobileOpen ? 'translate-x-0 w-64 shadow-2xl' : '-translate-x-full md:translate-x-0'
        } ${isCollapsed ? 'md:w-20' : 'md:w-64'} ${className}`}
      >
        {/* Sidebar Brand Header */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border/50 px-4">
          <div className="flex items-center gap-3 font-bold text-lg">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
              <Zap className="h-5 w-5" />
            </div>
            {(!isCollapsed || isMobileOpen) && (
              <span className="truncate bg-gradient-to-r from-primary via-blue-400 to-indigo-400 bg-clip-text text-transparent font-extrabold tracking-tight">
                {brandTitle}
              </span>
            )}
          </div>

          {/* Mobile Drawer Close Button */}
          <button
            ref={mobileCloseButtonRef}
            type="button"
            onClick={() => {
              setIsMobileOpen(false);
              mobileTriggerRef.current?.focus();
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Close Mobile Sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Dynamic Sectioned Navigation Menu */}
        <nav aria-label="Sidebar Menu" className="flex-1 space-y-6 overflow-y-auto p-3">
          {sections.map((section) => (
            <div key={section.id} className="space-y-1">
              {/* Section Header Title */}
              {(!isCollapsed || isMobileOpen) && section.title && (
                <h3 className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 select-none">
                  {section.title}
                </h3>
              )}

              {/* Section Navigation Links */}
              {section.items.map((item) => {
                const IconComponent = typeof item.icon === 'function' ? item.icon : undefined;
                const active = isItemActive(item);

                return (
                  <NavLink
                    key={item.id}
                    to={item.path}
                    end={item.path === '/'}
                    aria-current={active ? 'page' : undefined}
                    title={isCollapsed && !isMobileOpen ? item.label : undefined}
                    className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium text-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      active
                        ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20 font-semibold'
                        : 'text-muted-foreground hover:bg-accent/80 hover:text-accent-foreground'
                    }`}
                  >
                    {/* Icon Render */}
                    {IconComponent && (
                      <IconComponent
                        className={`h-5 w-5 shrink-0 transition-transform duration-200 ${
                          active ? 'scale-110' : 'group-hover:scale-105'
                        }`}
                      />
                    )}

                    {/* Label & Badge (Shown when expanded) */}
                    {(!isCollapsed || isMobileOpen) && (
                      <>
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.badge !== undefined && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                              active
                                ? 'bg-primary-foreground/20 text-primary-foreground'
                                : 'bg-primary/10 text-primary'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer Extension & Desktop Toggle Button */}
        <div className="shrink-0 border-t border-border/50 p-3 space-y-2">
          {footer}

          {/* Desktop Collapse Toggle Button */}
          <button
            type="button"
            onClick={toggleCollapse}
            className="hidden w-full items-center justify-center gap-2 rounded-xl border border-border/60 bg-card/40 p-2 font-medium text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground md:flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={isCollapsed ? 'Expand Sidebar (Ctrl+B)' : 'Collapse Sidebar (Ctrl+B)'}
            aria-expanded={!isCollapsed}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                <span>Collapse Sidebar</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
};
