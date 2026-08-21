import * as React from 'react';
import { Skeleton } from '@kinergy-platform/ui';
import type { CrudLoadingProps } from '../types/crud-state.types';

export const CrudLoading: React.FC<CrudLoadingProps> = ({
  variant = 'table',
  count,
  customFallback,
  className = '',
}) => {
  if (variant === 'custom' && customFallback) {
    return <div className={className}>{customFallback}</div>;
  }

  // 1. Table Variant
  if (variant === 'table') {
    const rowCount = count ?? 5;
    return (
      <div
        className={`w-full space-y-3 ${className}`}
        aria-busy="true"
        aria-live="polite"
        role="status"
      >
        <div className="flex items-center justify-between py-2 border-b border-border/40">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-16" />
        </div>
        {Array.from({ length: rowCount }).map((_, index) => (
          <div
            key={`table-skel-row-${index}`}
            className="flex items-center justify-between py-3 border-b border-border/20"
          >
            <div className="flex items-center gap-3 w-1/3">
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <div className="space-y-1.5 w-full">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        ))}
      </div>
    );
  }

  // 2. Card Grid Variant
  if (variant === 'card') {
    const cardCount = count ?? 3;
    return (
      <div
        className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full ${className}`}
        aria-busy="true"
        aria-live="polite"
        role="status"
      >
        {Array.from({ length: cardCount }).map((_, index) => (
          <div
            key={`card-skel-${index}`}
            className="rounded-lg border border-border/60 p-5 space-y-4 bg-card/40"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-4/5" />
            </div>
            <div className="pt-2 border-t border-border/30 flex justify-between items-center">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-20 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // 3. Detail View Variant
  if (variant === 'detail') {
    return (
      <div
        className={`w-full space-y-6 max-w-5xl ${className}`}
        aria-busy="true"
        aria-live="polite"
        role="status"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24 rounded-md" />
            <Skeleton className="h-9 w-28 rounded-md" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-4 rounded-lg border border-border/60 p-6">
            <Skeleton className="h-6 w-48 mb-4" />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-5 w-36" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-5 w-36" />
              </div>
            </div>
          </div>
          <div className="space-y-4 rounded-lg border border-border/60 p-6">
            <Skeleton className="h-6 w-32 mb-4" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>
    );
  }

  // 4. Form Variant
  return (
    <div
      className={`w-full space-y-5 max-w-xl ${className}`}
      aria-busy="true"
      aria-live="polite"
      role="status"
    >
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-24 w-full rounded-md" />
      </div>
      <div className="pt-4 flex justify-end gap-3">
        <Skeleton className="h-9 w-20 rounded-md" />
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
    </div>
  );
};

CrudLoading.displayName = 'CrudLoading';
