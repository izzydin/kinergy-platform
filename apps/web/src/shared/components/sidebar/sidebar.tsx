import { ChevronLeft, ChevronRight, Menu, X, Zap } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation } from 'react-router-dom';
import { useNavigation } from '../../../app/navigation';
import type { NavigationItem } from '../../../app/navigation/navigation.types';
import { useTranslation } from '../../../app/providers/locale-provider';

export interface SidebarProps {
  /** Optional brand title header slot */
  brandTitle?: string;
  /** Optional custom sidebar footer content slot */
  footer?: React.ReactNode;
  /** Additional CSS class names */
  className?: string;
}

interface TooltipState {
  text: string;
  top: number;
  left: number;
}

/**
 * Accessible, Responsive, Configuration-Driven Sidebar Component
 *
 * Consumes the Navigation Framework (`useNavigation()`) dynamically to render sectioned,
 * permission-aware navigation links without hardcoding business module menu entries.
 *
 * Layout & Usability Architecture:
 * - Persistent Header: Brand identity & Collapse/Expand control reside in the top header row,
 *   guaranteeing immediate visibility without requiring users to scroll through navigation items.
 * - Viewport Height Constraint: Sidebar is pinned to viewport height (`md:sticky md:top-0 md:h-screen md:max-h-screen`),
 *   with an independently scrollable navigation container (`overflow-y-auto`).
 * - Collapsed Navigation Fidelity: Every authorized navigation item displays its centered icon,
 *   with the text label visually hidden via `sr-only` to preserve accessibility and screen-reader semantics.
 * - Non-Clipped Portal Tooltips: Displays accessible floating tooltips rendered into `document.body`
 *   on both mouse hover and keyboard focus (`Tab`), preventing any clipping by sidebar overflow containers.
 * - Responsive Features:
 *   - Desktop: Smooth width transition (256px expanded <-> 80px collapsed) with `Ctrl+B` / `Cmd+B` shortcut
 *   - Mobile (< md): Slide-over overlay drawer with backdrop blur overlay and body scroll locking
 *   - Keyboard Accessibility: `Escape` key close handler, focus management & trap focus restoration
 *   - WAI-ARIA Standards: `role="navigation"`, `aria-current="page"`, `aria-expanded`, `aria-label`, `role="tooltip"`
 */
export const Sidebar: React.FC<SidebarProps> = ({
  brandTitle = 'Kinergy',
  footer,
  className = '',
}) => {
  const location = useLocation();
  const { sections } = useNavigation();
  const { t } = useTranslation();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [tooltipState, setTooltipState] = useState<TooltipState | null>(null);

  // References for focus management
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileCloseButtonRef = useRef<HTMLButtonElement>(null);

  // Close mobile sidebar automatically upon route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

  // Clear tooltips on route change or when collapse state changes
  useEffect(() => {
    setTooltipState(null);
  }, [location.pathname, isCollapsed]);

  // Dismiss tooltips on window resize or window-level scroll
  useEffect(() => {
    const handleScrollOrResize = () => setTooltipState(null);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, []);

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
      // Escape key closes tooltips and mobile navigation drawer
      if (event.key === 'Escape') {
        setTooltipState(null);
        if (isMobileOpen) {
          setIsMobileOpen(false);
          mobileTriggerRef.current?.focus();
        }
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

  const toggleCollapse = () => {
    setTooltipState(null);
    setIsCollapsed((prev) => !prev);
  };
  const toggleMobile = () => setIsMobileOpen((prev) => !prev);

  const showTooltip = (
    e: React.MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement>,
    text: string,
  ) => {
    if (!isCollapsed || isMobileOpen) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipState({
      text,
      top: rect.top + rect.height / 2,
      left: rect.right + 10,
    });
  };

  const hideTooltip = () => {
    setTooltipState(null);
  };

  const isItemActive = (item: NavigationItem): boolean => {
    if (item.path === '/') {
      return location.pathname === '/';
    }
    if (item.path === '/dashboard') {
      return location.pathname === '/dashboard' || location.pathname === '/dashboard/';
    }
    return location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
  };

  const renderItemIcon = (item: NavigationItem, active: boolean) => {
    const iconClasses = `h-5 w-5 shrink-0 transition-transform duration-200 ${
      active
        ? 'scale-110 text-brand-green'
        : 'text-white/80 group-hover:scale-105 group-hover:text-white'
    }`;

    if (item.icon) {
      if (
        typeof item.icon === 'function' ||
        (typeof item.icon === 'object' && item.icon !== null)
      ) {
        const IconComponent = item.icon as React.ComponentType<{
          className?: string;
          'aria-hidden'?: boolean | 'true' | 'false';
        }>;
        return <IconComponent className={iconClasses} aria-hidden="true" />;
      }
    }

    // Fallback if no icon is specified: use initial letter
    return (
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-bold ${
          active ? 'bg-brand-green text-brand-charcoal' : 'bg-white/10 text-white'
        }`}
        aria-hidden="true"
      >
        {item.label ? item.label.charAt(0).toUpperCase() : '?'}
      </span>
    );
  };

  const isCollapsedView = isCollapsed && !isMobileOpen;

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
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-white/10 bg-brand-charcoal text-white transition-all duration-300 ease-in-out md:sticky md:top-0 md:h-screen md:max-h-screen ${
          isMobileOpen ? 'translate-x-0 w-64 shadow-2xl' : '-translate-x-full md:translate-x-0'
        } ${isCollapsed ? 'md:w-20' : 'md:w-64'} ${className}`}
      >
        {/* Persistent Sidebar Header (Brand Identity + Immediate Collapse Control) */}
        <div className="shrink-0 border-b border-white/10">
          <div
            className={`flex items-center ${
              isCollapsedView
                ? 'flex-col justify-center py-3 gap-2 px-2'
                : 'h-16 justify-between px-4'
            }`}
          >
            {/* Brand Logo & Title */}
            <div
              className={`flex items-center gap-3 font-bold text-lg min-w-0 ${
                isCollapsedView ? 'justify-center w-full' : ''
              }`}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-green text-brand-charcoal shadow-md shadow-brand-green/20">
                <Zap className="h-5 w-5" />
              </div>
              {!isCollapsedView && (
                <span className="truncate text-white font-extrabold tracking-tight">
                  {brandTitle}
                </span>
              )}
            </div>

            {/* Desktop Collapse / Expand Button - Pinned at the Header */}
            {isCollapsedView ? (
              <button
                type="button"
                onClick={toggleCollapse}
                onMouseEnter={(e) =>
                  showTooltip(e, `${t('nav.expandSidebar', 'Expand Sidebar')} (Ctrl+B)`)
                }
                onMouseLeave={hideTooltip}
                onFocus={(e) =>
                  showTooltip(e, `${t('nav.expandSidebar', 'Expand Sidebar')} (Ctrl+B)`)
                }
                onBlur={hideTooltip}
                className="hidden md:flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#C1CBC3] transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green"
                aria-label={`${t('nav.expandSidebar', 'Expand Sidebar')} (Ctrl+B)`}
                aria-expanded={false}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={toggleCollapse}
                onMouseEnter={(e) =>
                  showTooltip(e, `${t('nav.collapseSidebar', 'Collapse Sidebar')} (Ctrl+B)`)
                }
                onMouseLeave={hideTooltip}
                onFocus={(e) =>
                  showTooltip(e, `${t('nav.collapseSidebar', 'Collapse Sidebar')} (Ctrl+B)`)
                }
                onBlur={hideTooltip}
                className="hidden md:flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#C1CBC3] transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green"
                aria-label={`${t('nav.collapseSidebar', 'Collapse Sidebar')} (Ctrl+B)`}
                aria-expanded={true}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}

            {/* Mobile Drawer Close Button */}
            <button
              ref={mobileCloseButtonRef}
              type="button"
              onClick={() => {
                setIsMobileOpen(false);
                mobileTriggerRef.current?.focus();
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#C1CBC3] transition-colors hover:bg-white/10 hover:text-white md:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green"
              aria-label="Close Mobile Sidebar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Dynamic Sectioned Navigation Menu (Scrolls Independently) */}
        <nav
          aria-label="Sidebar Menu"
          className="flex-1 min-h-0 space-y-6 overflow-y-auto overflow-x-hidden p-3"
          onScroll={hideTooltip}
        >
          {sections.map((section, sectionIndex) => (
            <div key={section.id} className="space-y-1">
              {/* Collapsed Section Separator */}
              {isCollapsedView && sectionIndex > 0 && (
                <div className="my-2 border-t border-white/10 mx-2" aria-hidden="true" />
              )}

              {/* Section Header Title (Expanded Mode) */}
              {!isCollapsedView && section.title && (
                <h3 className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#C1CBC3] select-none">
                  {t(section.title, section.title)}
                </h3>
              )}

              {/* Section Navigation Links */}
              {section.items.map((item) => {
                const active = isItemActive(item);
                const localizedLabel = t(item.label, item.label);
                const tooltipText =
                  item.badge !== undefined ? `${localizedLabel} (${item.badge})` : localizedLabel;

                return (
                  <NavLink
                    key={item.id}
                    to={item.path}
                    end={item.path === '/'}
                    aria-current={active ? 'page' : undefined}
                    aria-label={localizedLabel}
                    onMouseEnter={(e) => showTooltip(e, tooltipText)}
                    onMouseLeave={hideTooltip}
                    onFocus={(e) => showTooltip(e, tooltipText)}
                    onBlur={hideTooltip}
                    className={`group relative flex items-center rounded-xl font-medium text-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green ${
                      isCollapsedView ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'
                    } ${
                      active
                        ? 'bg-brand-forest text-white shadow-md font-semibold'
                        : 'text-white/90 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {/* Active Visual Indicator Bar (WCAG 1.4.1) */}
                    {active && (
                      <span
                        className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-brand-green"
                        aria-hidden="true"
                      />
                    )}

                    {/* Icon Render */}
                    {renderItemIcon(item, active)}

                    {/* Label (Visually hidden in collapsed mode via sr-only, shown when expanded) */}
                    <span className={isCollapsedView ? 'sr-only' : 'flex-1 truncate'}>
                      {localizedLabel}
                    </span>

                    {/* Badge */}
                    {item.badge !== undefined &&
                      (isCollapsedView ? (
                        <span
                          className="absolute top-1.5 right-1.5 flex h-2 w-2 rounded-full bg-brand-green ring-2 ring-brand-charcoal"
                          aria-hidden="true"
                        />
                      ) : (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                            active ? 'bg-brand-green text-brand-charcoal' : 'bg-white/15 text-white'
                          }`}
                        >
                          {item.badge}
                        </span>
                      ))}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer Extension (Separate from Navigation Scroll Area) */}
        {footer && (
          <div
            className={`shrink-0 border-t border-white/10 ${
              isCollapsedView ? 'p-2 overflow-hidden' : 'p-3'
            }`}
          >
            {footer}
          </div>
        )}
      </aside>

      {/* Floating Accessible Tooltip for Collapsed Mode (Non-clipped Portal) */}
      {tooltipState &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-50 rounded-lg border border-white/20 bg-brand-charcoal px-3 py-1.5 text-xs font-semibold text-white shadow-xl backdrop-blur-md transition-opacity duration-150 animate-in fade-in-0"
            style={{
              top: `${tooltipState.top}px`,
              left: `${tooltipState.left}px`,
              transform: 'translateY(-50%)',
            }}
          >
            {tooltipState.text}
          </div>,
          document.body,
        )}
    </>
  );
};
