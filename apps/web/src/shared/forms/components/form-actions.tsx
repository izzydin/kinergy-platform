import * as React from 'react';
import { cn } from '@kinergy-platform/ui';

export type FormActionsAlign = 'end' | 'start' | 'between';

export interface FormActionsProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Horizontal alignment of the action buttons.
   * - `"end"`: Right-aligned (default — most common for confirmations)
   * - `"start"`: Left-aligned
   * - `"between"`: Space-between (e.g., Cancel left, Submit right)
   * @default "end"
   */
  align?: FormActionsAlign;
}

/**
 * FormActions
 *
 * Standardized action row container for form submission and cancellation controls.
 * Handles button ordering, spacing, and responsive layout automatically.
 *
 * On mobile, buttons stack vertically (column-reverse to keep primary action first).
 * On sm+ screens, they render horizontally with `align` controlling justification.
 *
 * @example — End-aligned (dialog pattern)
 * ```tsx
 * <FormActions>
 *   <FormCancelButton onCancel={handleClose} disabled={isPending} />
 *   <FormSubmitButton isPending={isPending} loadingText="Saving...">
 *     Save Changes
 *   </FormSubmitButton>
 * </FormActions>
 * ```
 *
 * @example — Space-between (page form pattern)
 * ```tsx
 * <FormActions align="between">
 *   <FormCancelButton onCancel={() => navigate(-1)} />
 *   <FormSubmitButton isPending={isPending}>Save Settings</FormSubmitButton>
 * </FormActions>
 * ```
 */
export const FormActions = React.forwardRef<HTMLDivElement, FormActionsProps>(
  ({ className, align = 'end', children, ...props }, ref) => {
    const alignClass: Record<FormActionsAlign, string> = {
      end: 'sm:justify-end',
      start: 'sm:justify-start',
      between: 'sm:justify-between',
    };

    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col-reverse gap-2 pt-2',
          'sm:flex-row sm:items-center',
          alignClass[align],
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);

FormActions.displayName = 'FormActions';
