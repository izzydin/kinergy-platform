import React from 'react';

export interface IntelligencePageContainerProps {
  children: React.ReactNode;
  /** Whether the container itself should provide vertical scrolling (default: false) */
  scrollable?: boolean;
  /** Additional container CSS classes */
  className?: string;
  /** Test identifier */
  testId?: string;
}

/**
 * Standardized Page Container for Intelligence Views.
 *
 * Enforces layout invariants:
 * - Adapts to available viewport height without nested double-scrolling
 * - Flex-1 min-h-0 container ensuring child chat components can pin composers to the bottom
 * - Prevents horizontal overflow
 */
export const IntelligencePageContainer: React.FC<IntelligencePageContainerProps> = ({
  children,
  scrollable = false,
  className = '',
  testId = 'intelligence-page-container',
}) => {
  return (
    <div
      data-testid={testId}
      className={`flex flex-1 min-h-0 flex-col gap-4 ${
        scrollable ? 'overflow-y-auto pr-1' : 'overflow-hidden'
      } ${className}`}
    >
      {children}
    </div>
  );
};
