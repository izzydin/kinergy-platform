import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Standardized Design System Style Merging Utility
 *
 * Combines `clsx` for conditional class logic and `tailwind-merge` to resolve
 * Tailwind CSS utility conflicts in proper composition order:
 * Base Styles -> Variant Styles -> Conditional State -> Consumer `className` Overrides
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
