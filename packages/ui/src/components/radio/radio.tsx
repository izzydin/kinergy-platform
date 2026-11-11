import * as React from 'react';
import type { BaseComponentProps } from '../../contracts';
import { cn } from '../../primitives/cn';

interface RadioGroupContextValue {
  name?: string;
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
}

const RadioGroupContext = React.createContext<RadioGroupContextValue | null>(null);

export interface RadioGroupProps extends React.HTMLAttributes<HTMLDivElement>, BaseComponentProps {
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
}

/**
 * RadioGroup Primitive Component
 */
export const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(
  (
    {
      className,
      name,
      value: controlledValue,
      defaultValue,
      onValueChange,
      disabled = false,
      children,
      ...props
    },
    ref,
  ) => {
    const [internalValue, setInternalValue] = React.useState(defaultValue);
    const isControlled = controlledValue !== undefined;
    const activeValue = isControlled ? controlledValue : internalValue;

    const onChange = (val: string) => {
      if (!isControlled) {
        setInternalValue(val);
      }
      onValueChange?.(val);
    };

    return (
      <RadioGroupContext.Provider value={{ name, value: activeValue, onChange, disabled }}>
        <div ref={ref} role="radiogroup" className={cn('grid gap-2', className)} {...props}>
          {children}
        </div>
      </RadioGroupContext.Provider>
    );
  },
);

RadioGroup.displayName = 'RadioGroup';

export interface RadioItemProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'>, BaseComponentProps {
  value: string;
  label?: React.ReactNode;
  description?: React.ReactNode;
}

/**
 * Radio Item Primitive Component
 */
export const Radio = React.forwardRef<HTMLInputElement, RadioItemProps>(
  ({ className, id, value, label, description, disabled, ...props }, ref) => {
    const context = React.useContext(RadioGroupContext);
    const autoId = React.useId();
    const radioId = id || autoId;

    const isChecked = context?.value === value;
    const isDisabled = disabled || context?.disabled || false;

    const handleChange = () => {
      if (!isDisabled) {
        context?.onChange?.(value);
      }
    };

    return (
      <div className={cn('inline-flex items-start gap-2.5', className)}>
        <div className="relative flex items-center justify-center pt-0.5">
          <input
            ref={ref}
            type="radio"
            id={radioId}
            name={context?.name}
            value={value}
            checked={isChecked}
            disabled={isDisabled}
            onChange={handleChange}
            className="peer sr-only"
            {...props}
          />
          <div
            aria-hidden="true"
            className={cn(
              'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-primary ring-offset-background transition-colors',
              'peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2',
              'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
              isChecked ? 'border-primary' : 'border-primary hover:bg-accent',
            )}
          >
            {isChecked && <div className="h-2 w-2 rounded-full bg-primary" />}
          </div>
        </div>

        {(label || description) && (
          <div className="grid gap-0.5 leading-none select-none">
            {label && (
              <label
                htmlFor={radioId}
                className={cn(
                  'text-sm font-medium text-foreground cursor-pointer',
                  isDisabled && 'cursor-not-allowed opacity-70',
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

Radio.displayName = 'Radio';
