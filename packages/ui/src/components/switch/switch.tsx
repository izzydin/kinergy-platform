import * as React from 'react';
import type { BaseComponentProps } from '../../contracts';
import { cn } from '../../primitives/cn';
import { FOCUS_RING_CLASSES } from '../../primitives/variants';

export interface SwitchProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'>, BaseComponentProps {
  /** Controlled checked status */
  checked?: boolean;
  /** Uncontrolled default checked status */
  defaultChecked?: boolean;
  /** Change callback */
  onCheckedChange?: (checked: boolean) => void;
  /** Visible label */
  label?: React.ReactNode;
  /** Descriptive sub-label */
  description?: React.ReactNode;
  /** Validation error indicator */
  isInvalid?: boolean;
}

/**
 * Switch Primitive Component
 *
 * Accessible toggle switch compliant with WAI-ARIA switch pattern (`role="switch"`).
 */
export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  (
    {
      className,
      id,
      checked,
      defaultChecked = false,
      disabled = false,
      isInvalid,
      onCheckedChange,
      label,
      description,
      onClick,
      onKeyDown,
      ...props
    },
    ref,
  ) => {
    const autoId = React.useId();
    const switchId = id || autoId;
    const [isChecked, setIsChecked] = React.useState(defaultChecked);

    const isControlled = checked !== undefined;
    const activeChecked = isControlled ? checked : isChecked;

    const toggle = () => {
      if (disabled) return;
      const next = !activeChecked;
      if (!isControlled) {
        setIsChecked(next);
      }
      onCheckedChange?.(next);
    };

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      toggle();
      onClick?.(e);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        toggle();
      }
      onKeyDown?.(e);
    };

    return (
      <div className={cn('inline-flex items-center gap-3', className)}>
        <button
          ref={ref}
          type="button"
          role="switch"
          id={switchId}
          aria-checked={activeChecked}
          aria-invalid={isInvalid ? true : undefined}
          disabled={disabled}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          className={cn(
            'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
            FOCUS_RING_CLASSES,
            'disabled:cursor-not-allowed disabled:opacity-50',
            activeChecked ? 'bg-primary' : 'bg-input',
            isInvalid && 'border-destructive focus-visible:ring-destructive',
          )}
          {...props}
        >
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform',
              activeChecked ? 'translate-x-5' : 'translate-x-0',
            )}
          />
        </button>

        {(label || description) && (
          <div className="grid gap-0.5 leading-none select-none">
            {label && (
              <label
                htmlFor={switchId}
                className={cn(
                  'text-sm font-medium text-foreground cursor-pointer',
                  disabled && 'cursor-not-allowed opacity-70',
                )}
              >
                {label}
              </label>
            )}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
        )}
      </div>
    );
  },
);

Switch.displayName = 'Switch';
