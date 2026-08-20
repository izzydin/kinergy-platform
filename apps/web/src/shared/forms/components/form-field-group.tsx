import * as React from 'react';
import { cn } from '@kinergy-platform/ui';

export type FormFieldGroupColumns = 1 | 2 | 3;

export interface FormFieldGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Number of columns in the horizontal field grid.
   * Collapses to 1 column on small (mobile) screens.
   * @default 2
   */
  columns?: FormFieldGroupColumns;
}

/**
 * FormFieldGroup
 *
 * A horizontal grouping of form fields arranged in a responsive grid.
 * Useful for composing related fields side-by-side (e.g., first name + last name,
 * start date + end date).
 *
 * Automatically collapses to a single column on small screens.
 *
 * @example
 * ```tsx
 * <FormFieldGroup columns={2}>
 *   <FormField>
 *     <FormLabel>First Name</FormLabel>
 *     <FormControl><Input {...register('firstName')} /></FormControl>
 *     <FormErrorMessage>{errors.firstName?.message}</FormErrorMessage>
 *   </FormField>
 *   <FormField>
 *     <FormLabel>Last Name</FormLabel>
 *     <FormControl><Input {...register('lastName')} /></FormControl>
 *     <FormErrorMessage>{errors.lastName?.message}</FormErrorMessage>
 *   </FormField>
 * </FormFieldGroup>
 * ```
 */
export const FormFieldGroup = React.forwardRef<HTMLDivElement, FormFieldGroupProps>(
  ({ className, columns = 2, children, ...props }, ref) => {
    const colsClass: Record<FormFieldGroupColumns, string> = {
      1: 'grid-cols-1',
      2: 'grid-cols-1 sm:grid-cols-2',
      3: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3',
    };

    return (
      <div ref={ref} className={cn('grid gap-4', colsClass[columns], className)} {...props}>
        {children}
      </div>
    );
  },
);

FormFieldGroup.displayName = 'FormFieldGroup';
