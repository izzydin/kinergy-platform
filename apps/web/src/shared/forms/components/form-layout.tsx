import * as React from 'react';
import { cn } from '@kinergy-platform/ui';

export type FormLayoutVariant = 'page' | 'dialog';

export interface FormLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Layout variant.
   * - `"page"`: Full-width form with vertical section rhythm, max-w-2xl, suitable for settings pages.
   * - `"dialog"`: Compact vertical stack, minimal spacing, suitable for modal dialog forms.
   * @default "page"
   */
  variant?: FormLayoutVariant;
  /** Optional stable form element id (for cross-element `form` prop linking). */
  formId?: string;
}

/**
 * FormLayout
 *
 * Top-level form layout shell. Provides vertical rhythm and responsive width constraints
 * appropriate for the form context.
 *
 * Must be placed inside a `<form>` element (or alongside one using `formId`).
 *
 * @example — Page form
 * ```tsx
 * <form id="settings-form" onSubmit={handleSubmit(onSubmit)} noValidate>
 *   <FormLayout variant="page">
 *     <FormSection title="Account Details">...</FormSection>
 *     <FormActions>...</FormActions>
 *   </FormLayout>
 * </form>
 * ```
 *
 * @example — Dialog form
 * ```tsx
 * <form id="edit-user-form" onSubmit={handleSubmit(onSubmit)} noValidate>
 *   <FormLayout variant="dialog">...</FormLayout>
 * </form>
 * ```
 */
export const FormLayout = React.forwardRef<HTMLDivElement, FormLayoutProps>(
  ({ className, variant = 'page', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col',
          variant === 'page' && 'w-full max-w-2xl gap-8',
          variant === 'dialog' && 'w-full gap-4 py-2',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);

FormLayout.displayName = 'FormLayout';
