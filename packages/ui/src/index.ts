/**
 * Shared UI Tokens & Component Contracts
 */

export interface ComponentProps {
  className?: string;
  id?: string;
}

export interface ButtonVariantProps {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
}
