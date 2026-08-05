import React from 'react';
import type { StandardSize, StandardVariant } from '../primitives/variants';

/**
 * Base Component Prop Interface
 * Every UI component in the platform MUST extend this contract.
 */
export interface BaseComponentProps {
  /** Optional custom CSS classes merged via `cn()` */
  className?: string;
  /** Optional element DOM id */
  id?: string;
  /** Optional children elements */
  children?: React.ReactNode;
}

/**
 * Polymorphic Component Contract
 * Supports rendering alternative elements via `asChild`.
 */
export interface PolymorphicProps {
  /** When true, delegates rendering to its child element while merging props/styles */
  asChild?: boolean;
}

/**
 * Standard Variant Prop Contract
 */
export interface VariantComponentProps<T = StandardVariant> {
  /** Visual styling variant */
  variant?: T;
}

/**
 * Standard Size Prop Contract
 */
export interface SizeComponentProps<T = StandardSize> {
  /** Component size scale */
  size?: T;
}

/**
 * Custom State Flag Contract
 * Standardized semantic boolean prefixes.
 */
export interface SemanticStateProps {
  /** Indicates active loading / pending operation status */
  isLoading?: boolean;
  /** Indicates invalid / error validation status */
  isInvalid?: boolean;
  /** Indicates container full width stretching */
  isFullWidth?: boolean;
  /** Indicates open/visible state for popovers, modals, drawers */
  isOpen?: boolean;
}

/**
 * Accessible Interactive Control Contract
 */
export interface AccessibleControlProps {
  /** Native disabled attribute or composite disabled state */
  disabled?: boolean;
  /** Accessible label for icon-only or non-text interactive controls */
  'aria-label'?: string;
  /** Element ID describing error or helper text */
  'aria-describedby'?: string;
  /** Element ID controlling expanded drawer/menu */
  'aria-controls'?: string;
  /** Expanded state indicator */
  'aria-expanded'?: boolean;
}

/**
 * Loading State Indicator Contract
 */
export interface LoadingStateProps {
  /** Text announced to screen readers during active loading state */
  loadingText?: string;
}
