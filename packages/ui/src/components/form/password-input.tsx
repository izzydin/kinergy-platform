import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '../../primitives/cn';
import { Input, type InputProps } from '../input/input';

export type PasswordInputProps = InputProps;

/**
 * PasswordInput Primitive Component
 *
 * Accessible password input primitive with integrated show/hide visibility toggle trigger.
 */
export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, disabled, ...props }, ref) => {
    const [isVisible, setIsVisible] = React.useState(false);

    const toggleVisibility = () => {
      setIsVisible((prev) => !prev);
    };

    return (
      <div className="relative flex items-center w-full">
        <Input
          ref={ref}
          type={isVisible ? 'text' : 'password'}
          disabled={disabled}
          className={cn('pr-10', className)}
          {...props}
        />
        <button
          type="button"
          tabIndex={0}
          disabled={disabled}
          onClick={toggleVisibility}
          aria-label={isVisible ? 'Hide password' : 'Show password'}
          className="absolute right-0 flex items-center justify-center h-full px-3 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-r-md disabled:pointer-events-none disabled:opacity-50"
        >
          {isVisible ? (
            <EyeOff className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
        </button>
      </div>
    );
  },
);

PasswordInput.displayName = 'PasswordInput';
