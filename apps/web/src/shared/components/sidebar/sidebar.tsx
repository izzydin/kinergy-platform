import { ChevronLeft, ChevronRight, Menu, X, Zap } from 'lucide-react';
import React, { useEffect, useState } from 'react';
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
 * Features:
 * - Responsive desktop collapse / mobile drawer slide-over
 * - Keyboard navigation & ARIA accessibility standards (`aria-current="page"`, `aria-expanded`)
 * - Active route highlighting with HSL design tokens
 * - Dynamic icon support & notification badges
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

  // Close mobile sidebar automatically upon route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

  // Keyboard accessibility: Close mobile drawer on Escape keypress
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isMobileOpen) {
        setIsMobileOpen(false);
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
        type="button"
        onClick={toggleMobile}
        className="fixed top-3 left-3 z-50 flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background/90 text-foreground shadow-lg backdrop-blur md:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={isMobileOpen ? 'Close Navigation Menu' : 'Open Navigation Menu'}
        aria-expanded={isMobileOpen}
      >
        {isMobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Mobile Backdrop Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm transition-opacity md:hidden"
          onClick={() => setIsMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar Element */}
      <aside
        aria-label="Main Navigation"
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border/50 bg-card/60 backdrop-blur-xl transition-all duration-300 ease-in-out md:static ${
          isMobileOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0'
        } ${isCollapsed ? 'md:w-20' : 'md:w-64'} ${className}`}
      >
        {/* Sidebar Brand Header */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border/50 px-4">
          <div className="flex items-center gap-3 font-bold text-lg">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
              <Zap className="h-5 w-5" />
            </div>
            {(!isCollapsed || isMobileOpen) && (
              <span className="truncate bg-gradient-to-r from-primary via-blue-400 to-indigo-400 bg-clip-text text-transparent">
                {brandTitle}
              </span>
            )}
          </div>

          {/* Mobile Close Button */}
          <button
            type="button"
            onClick={() => setIsMobileOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
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
                <h3 className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
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

          {/* Desktop Collapse Toggle */}
          <button
            type="button"
            onClick={toggleCollapse}
            className="hidden w-full items-center justify-center gap-2 rounded-xl border border-border/60 bg-card/40 p-2 font-medium text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground md:flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
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
