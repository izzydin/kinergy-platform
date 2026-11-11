import * as React from 'react';
import { Check } from 'lucide-react';
import type { BaseComponentProps, SemanticStateProps } from '../../contracts';
import { cn } from '../../primitives/cn';

export interface CheckboxProps
  extends
    Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    BaseComponentProps,
    SemanticStateProps {
  /** Optional visible label next to checkbox */
  label?: React.ReactNode;
  /** Optional descriptive helper text */
  description?: React.ReactNode;
}

/**
 * Checkbox Primitive Component
 *
 * Accessible native-backed custom checkbox with visible focus ring,
 * high-contrast checked indicator, and target-size compliance (WCAG 2.5.8).
 */
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      className,
      id,
      checked,
      defaultChecked,
      disabled,
      isInvalid = false,
      label,
      description,
      onChange,
      ...props
    },
    ref,
  ) => {
    const autoId = React.useId();
    const inputId = id || autoId;
    const [isChecked, setIsChecked] = React.useState(defaultChecked ?? false);

    const controlled = checked !== undefined;
    const currentChecked = controlled ? checked : isChecked;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!controlled) {
        setIsChecked(e.target.checked);
      }
      onChange?.(e);
    };

    return (
      <div className={cn('inline-flex items-start gap-2.5', className)}>
        <div className="relative flex items-center justify-center pt-0.5">
          <input
            ref={ref}
            type="checkbox"
            id={inputId}
            checked={currentChecked}
            disabled={disabled}
            aria-invalid={isInvalid ? true : undefined}
            onChange={handleChange}
            className="peer sr-only"
            {...props}
          />
          <div
            aria-hidden="true"
            className={cn(
              'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary ring-offset-background transition-colors',
              'peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2',
              'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
              currentChecked
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background hover:bg-accent',
              isInvalid && 'border-destructive peer-focus-visible:ring-destructive',
            )}
          >
            {currentChecked && <Check className="h-3 w-3 stroke-[3]" />}
          </div>
        </div>

        {(label || description) && (
          <div className="grid gap-1 leading-none select-none">
            {label && (
              <label
                htmlFor={inputId}
                className={cn(
                  'text-sm font-medium text-foreground cursor-pointer',
                  disabled && 'cursor-not-allowed opacity-70',
                  isInvalid && 'text-destructive',
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

Checkbox.displayName = 'Checkbox';
