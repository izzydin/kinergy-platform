import * as React from 'react';
import { cn } from '@kinergy-platform/ui';

export interface FormSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Optional section heading displayed above the field group.
   * Visible in `page` layout. Hidden in `dialog` layout unless `showInDialog` is true.
   */
  title?: string;
  /**
   * Optional descriptive text rendered beneath the section title.
   */
  description?: string;
  /**
   * When true, renders the title even inside dialog (compact) forms.
   * @default false
   */
  showInDialog?: boolean;
  /**
   * When true, renders a horizontal separator above the section (after the first section).
   * @default false
   */
  withSeparator?: boolean;
}

/**
 * FormSection
 *
 * A named group of related form fields. Provides a section heading and optional description
 * to improve scannability on longer page forms.
 *
 * The heading is hidden by default in dialog forms to preserve compact layout. Enable with
 * `showInDialog` for cases where the context requires explicit grouping.
 *
 * @example
 * ```tsx
 * <FormSection title="Contact Information" description="Used for notifications and recovery.">
 *   <FormField>...</FormField>
 *   <FormField>...</FormField>
 * </FormSection>
 * ```
 */
export const FormSection = React.forwardRef<HTMLDivElement, FormSectionProps>(
  ({ className, title, description, withSeparator = false, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col gap-4',
          withSeparator && 'border-t border-border pt-8',
          className,
        )}
        {...props}
      >
        {title && (
          <div className="space-y-1">
            <h3 className="text-base font-semibold leading-none tracking-tight text-foreground">
              {title}
            </h3>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
        )}
        <div className="flex flex-col gap-4">{children}</div>
      </div>
    );
  },
);

FormSection.displayName = 'FormSection';
