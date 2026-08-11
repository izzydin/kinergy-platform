import React, { Suspense } from 'react';

/**
 * Standardized Loading Skeleton Fallback Component
 *
 * Implements the 4-state UI contract (Loading state) to prevent layout shifts
 * during dynamic chunk loading.
 */
export const SuspenseFallback: React.FC<{ label?: string }> = ({ label = 'Loading View...' }) => {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className="flex min-h-[400px] w-full flex-col items-center justify-center gap-4 bg-background p-8 text-center text-foreground transition-colors"
    >
      <div className="flex items-center justify-center gap-2">
        <div className="h-3 w-3 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
        <div className="h-3 w-3 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
        <div className="h-3 w-3 animate-bounce rounded-full bg-primary" />
      </div>
      <p className="font-medium text-muted-foreground text-sm">{label}</p>
    </div>
  );
};

/**
 * Lazy View Wrapper Component
 *
 * Wraps lazy-loaded React components in a standard Suspense boundary.
 */
export const LazyView: React.FC<{
  children: React.ReactNode;
  fallbackLabel?: string;
}> = ({ children, fallbackLabel }) => {
  return <Suspense fallback={<SuspenseFallback label={fallbackLabel} />}>{children}</Suspense>;
};

/**
 * Higher-Order Component Helper for Lazy Loading Page Components
 *
 * @param importFn Dynamic import function () => import('./my-component')
 * @param fallbackLabel Custom label for the suspense loading fallback
 */
export function withLazy<P extends object>(
  importFn: () => Promise<{ default: React.ComponentType<P> }>,
  fallbackLabel?: string,
): React.FC<P> {
  const LazyComponent = React.lazy(importFn);

  return (props: P) => (
    <LazyView fallbackLabel={fallbackLabel}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <LazyComponent {...(props as any)} />
    </LazyView>
  );
}
