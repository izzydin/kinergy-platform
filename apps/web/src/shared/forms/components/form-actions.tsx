import * as React from 'react';
import { cn } from '@kinergy-platform/ui';

export type FormActionsAlign = 'end' | 'start' | 'between' | 'center';

export interface FormActionsProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Horizontal alignment of the action buttons on `sm` (tablet/desktop) viewports.
   * - `"end"`: Right-aligned (default — standard for modal dialogs and confirmations)
   * - `"start"`: Left-aligned (standard for left-aligned content editors)
   * - `"between"`: Space-between (e.g. Cancel left, Submit right)
   * - `"center"`: Center-aligned
   * @default "end"
   */
  align?: FormActionsAlign;
  /**
   * Stacking direction on small / mobile viewports.
   * - `"reverse"`: `flex-col-reverse` (default — keeps primary action prominent at the top on mobile)
   * - `"normal"`: `flex-col`
   * - `"row"`: `flex-row` (horizontal even on mobile if actions are brief)
   * @default "reverse"
   */
  mobileDirection?: 'reverse' | 'normal' | 'row';
}

/**
 * FormActions
 *
 * Standardized action row container for form submission, cancellation, and reset controls.
 * Handles button ordering, spacing, ref forwarding, and responsive layouts automatically.
 *
 * - On mobile (<640px), buttons stack according to `mobileDirection` (defaulting to `flex-col-reverse`
 *   to ensure the primary submit action remains first).
 * - On `sm`+ screens, buttons render horizontally with `align` controlling justification.
 *
 * @example — End-aligned (dialog / modal pattern)
 * ```tsx
 * <FormActions>
 *   <FormCancelButton onCancel={handleClose} isPending={isPending} />
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
  ({ className, align = 'end', mobileDirection = 'reverse', children, ...props }, ref) => {
    const alignClass: Record<FormActionsAlign, string> = {
      end: 'sm:justify-end',
      start: 'sm:justify-start',
      between: 'sm:justify-between',
      center: 'sm:justify-center',
    };

    const mobileClass = {
      reverse: 'flex flex-col-reverse',
      normal: 'flex flex-col',
      row: 'flex flex-row',
    };

    return (
      <div
        ref={ref}
        className={cn(
          'gap-2 pt-4 sm:flex sm:flex-row sm:items-center',
          mobileClass[mobileDirection],
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
