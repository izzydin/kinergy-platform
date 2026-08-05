import { cva, cx, type VariantProps } from 'class-variance-authority';

/**
 * Variant Strategy & Size Strategy Core Primitives
 *
 * Class Variance Authority (CVA) helper bindings for design system components.
 */
export { cva, cx };
export type { VariantProps };

/**
 * Standard Design System Component Variant Scale
 */
export type StandardVariant =
  'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link';

/**
 * Standard Design System Component Size Scale
 */
export type StandardSize = 'sm' | 'md' | 'lg' | 'xl' | 'icon';

/**
 * Accessible Focus Ring Style Tokens
 * Standardized focus indicators for all interactive components.
 */
export const FOCUS_RING_CLASSES =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

/**
 * Disabled State Style Tokens
 * Standardized disabled styling for interactive controls.
 */
export const DISABLED_CLASSES =
  'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50';
