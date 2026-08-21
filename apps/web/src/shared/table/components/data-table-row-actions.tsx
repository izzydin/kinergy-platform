import { Button } from '@kinergy-platform/ui';
import { MoreHorizontal } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import type { DataTableRowActionsProps } from '../types/data-table-actions.types';

/**
 * DataTableRowActions Component
 *
 * Implements an accessible, composable row action menu.
 * - Presentation-only: Actions are provided by the feature module.
 * - Keyboard navigable with ArrowDown / ArrowUp / Enter / Escape.
 * - Supports destructive actions and disabled states.
 */
export function DataTableRowActions<TData>({
  row,
  actions,
  triggerLabel = 'Open actions menu',
  className,
}: DataTableRowActionsProps<TData>): React.ReactElement | null {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const visibleActions = actions.filter((action) => !action.hidden);

  useEffect(() => {
    if (isOpen) {
      setActiveIndex(0);
    } else {
      setActiveIndex(-1);
    }
  }, [isOpen]);

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

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} aria-hidden="true" />
          <div
            ref={menuRef}
            role="menu"
            aria-label="Row actions"
            className="absolute right-0 z-50 mt-1.5 w-40 min-w-[8rem] rounded-md border border-border bg-card p-1 shadow-lg ring-1 ring-black/5 focus:outline-none"
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
                    type="button"
                    role="menuitem"
                    disabled={isDisabled}
                    onClick={() => handleActionClick(action)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-2 rounded-sm px-2.5 py-1.5 text-xs font-medium transition-colors focus:outline-none',
                      isFocused &&
                        !isDisabled &&
                        (isDestructive ? 'bg-destructive/10' : 'bg-muted'),
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
      )}
    </div>
  );
}
