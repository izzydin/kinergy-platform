import { Button } from '@kinergy-platform/ui';
import { MoreHorizontal } from 'lucide-react';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';
import type { DataTableRowActionsProps } from '../types/data-table-actions.types';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * DataTableRowActions Component
 *
 * Implements an accessible, composable row action menu.
 * - Presentation-only: Actions are provided by the feature module.
 * - Renders through a portal by default to escape table container overflow clipping (`overflow-x: auto`).
 * - Supports automatic collision detection and flip repositioning above the trigger.
 * - Viewport boundary collision handling prevents horizontal and vertical clipping.
 * - Scroll and resize tracking keeps position synchronized or dismisses when scrolled out of view.
 * - Keyboard navigable with ArrowDown / ArrowUp / Home / End / Enter / Space / Escape / Tab.
 * - Supports destructive actions and disabled states.
 */
export function DataTableRowActions<TData>({
  row,
  actions,
  triggerLabel = 'Open actions menu',
  className,
  usePortal = true,
  align = 'end',
}: DataTableRowActionsProps<TData>): React.ReactElement | null {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [placement, setPlacement] = useState<'top' | 'bottom'>('bottom');
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const visibleActions = actions.filter((action) => !action.hidden);

  useEffect(() => {
    if (isOpen) {
      setActiveIndex(0);
    } else {
      setActiveIndex(-1);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && activeIndex >= 0 && itemRefs.current[activeIndex]) {
      itemRefs.current[activeIndex]?.focus();
    }
  }, [isOpen, activeIndex]);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !menuRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();

    // If trigger button is scrolled completely out of view, close menu
    if (
      triggerRect.bottom < 0 ||
      triggerRect.top > window.innerHeight ||
      triggerRect.right < 0 ||
      triggerRect.left > window.innerWidth
    ) {
      setIsOpen(false);
      return;
    }

    const menuEl = menuRef.current;
    const menuWidth = menuEl.offsetWidth || 160;
    const menuHeight = menuEl.offsetHeight || 160;

    const SPACING = 6;
    const VIEWPORT_PADDING = 8;

    const spaceBelow = window.innerHeight - triggerRect.bottom - SPACING - VIEWPORT_PADDING;
    const spaceAbove = triggerRect.top - SPACING - VIEWPORT_PADDING;

    // Reposition above if insufficient space below AND more space above
    const shouldFlipAbove = spaceBelow < menuHeight && spaceAbove > spaceBelow;
    const nextPlacement = shouldFlipAbove ? 'top' : 'bottom';

    let left: number;
    if (align === 'start') {
      left = triggerRect.left;
      if (left + menuWidth > window.innerWidth - VIEWPORT_PADDING) {
        left = Math.max(VIEWPORT_PADDING, window.innerWidth - VIEWPORT_PADDING - menuWidth);
      }
    } else {
      left = triggerRect.right - menuWidth;
      if (left < VIEWPORT_PADDING) {
        left = Math.max(VIEWPORT_PADDING, triggerRect.left);
      }
      if (left + menuWidth > window.innerWidth - VIEWPORT_PADDING) {
        left = Math.max(VIEWPORT_PADDING, window.innerWidth - VIEWPORT_PADDING - menuWidth);
      }
    }

    menuEl.style.position = 'fixed';
    menuEl.style.left = `${Math.round(left)}px`;
    menuEl.style.right = 'auto';

    if (nextPlacement === 'top') {
      menuEl.style.top = 'auto';
      menuEl.style.bottom = `${Math.round(window.innerHeight - triggerRect.top + SPACING)}px`;
      menuEl.style.maxHeight = `${Math.max(80, Math.round(spaceAbove))}px`;
    } else {
      menuEl.style.bottom = 'auto';
      menuEl.style.top = `${Math.round(triggerRect.bottom + SPACING)}px`;
      menuEl.style.maxHeight = `${Math.max(80, Math.round(spaceBelow))}px`;
    }

    menuEl.dataset.placement = nextPlacement;
    setPlacement(nextPlacement);
  }, [align]);

  useIsomorphicLayoutEffect(() => {
    if (isOpen && usePortal) {
      updatePosition();
    }
  }, [isOpen, usePortal, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDownOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handlePointerDownOutside);
    document.addEventListener('touchstart', handlePointerDownOutside);
    window.addEventListener('keydown', handleWindowKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDownOutside);
      document.removeEventListener('touchstart', handlePointerDownOutside);
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !usePortal) return;

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, usePortal, updatePosition]);

  if (visibleActions.length === 0) {
    return null;
  }

  const handleActionClick = (action: (typeof visibleActions)[number]) => {
    if (action.disabled) return;
    setIsOpen(false);
    action.onClick(row);
    triggerRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.defaultPrevented) return;

    if (!isOpen) {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (event.key) {
      case 'Escape':
      case 'Tab':
        event.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setActiveIndex(visibleActions.length - 1);
        break;
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex((prev) => (prev + 1) % visibleActions.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex((prev) => (prev - 1 + visibleActions.length) % visibleActions.length);
        break;
      case 'Enter':
      case ' ': {
        event.preventDefault();
        const currentAction = visibleActions[activeIndex];
        if (currentAction && !currentAction.disabled) {
          handleActionClick(currentAction);
        }
        break;
      }
    }
  };

  const menuContent = (
    <>
      <div
        className="fixed inset-0 z-40 bg-transparent"
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />
      <div
        ref={menuRef}
        role="menu"
        aria-label="Row actions"
        data-placement={placement}
        data-state={isOpen ? 'open' : 'closed'}
        onKeyDown={handleKeyDown}
        className={cn(
          usePortal
            ? 'fixed z-50 w-40 min-w-[8rem] overflow-y-auto rounded-md border border-border bg-card p-1 shadow-lg ring-1 ring-black/5 focus:outline-none'
            : 'absolute right-0 z-50 mt-1.5 w-40 min-w-[8rem] rounded-md border border-border bg-card p-1 shadow-lg ring-1 ring-black/5 focus:outline-none',
        )}
      >
        <div className="space-y-0.5">
          {visibleActions.map((action, index) => {
            const Icon = action.icon;
            const isDestructive = action.isDestructive;
            const isDisabled = action.disabled;
            const isFocused = index === activeIndex;

            return (
              <button
                key={action.id}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                type="button"
                role="menuitem"
                tabIndex={isFocused ? 0 : -1}
                disabled={isDisabled}
                onClick={() => handleActionClick(action)}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2 rounded-sm px-2.5 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  isFocused && !isDisabled && (isDestructive ? 'bg-destructive/10' : 'bg-muted'),
                  isDestructive
                    ? 'text-destructive hover:bg-destructive/10 hover:text-destructive'
                    : 'text-foreground hover:bg-muted hover:text-foreground',
                  isDisabled && 'cursor-not-allowed opacity-50',
                )}
              >
                {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                <span>{action.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );

  return (
    <div className={cn('relative inline-block text-left', className)} onKeyDown={handleKeyDown}>
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={triggerLabel}
        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </Button>

      {isOpen &&
        (usePortal && typeof document !== 'undefined'
          ? createPortal(menuContent, document.body)
          : menuContent)}
    </div>
  );
}
