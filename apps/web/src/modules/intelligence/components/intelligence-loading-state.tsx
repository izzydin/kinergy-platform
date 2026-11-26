import React from 'react';
import { Skeleton } from '@kinergy-platform/ui';

export type IntelligenceLoadingVariant = 'chat' | 'conversation-list' | 'knowledge' | 'page';

export interface IntelligenceLoadingStateProps {
  /** Loading presentation variant (default: 'page') */
  readonly variant?: IntelligenceLoadingVariant;
  /** Accessible screen reader announcement message */
  readonly message?: string;
  /** Custom additional CSS classes */
  readonly className?: string;
  /** Custom test identifier */
  readonly testId?: string;
}

/**
 * Reusable Page & View Loading State Primitive for Kynergy Intelligence.
 *
 * Implements the WCAG 2.2 AA loading contract:
 * - `role="status"` with `aria-busy="true"` and `aria-live="polite"`
 * - Visually hidden screen reader announcements (`.sr-only`)
 * - Respects `prefers-reduced-motion` via `motion-reduce:animate-none`
 * - Eliminates Cumulative Layout Shift (CLS) with proportional skeleton geometry
 * - Sets `aria-hidden="true"` on purely visual skeleton placeholders
 */
export const IntelligenceLoadingState: React.FC<IntelligenceLoadingStateProps> = ({
  variant = 'page',
  message = 'Cargando contenido de Inteligencia...',
  className = '',
  testId = 'intelligence-loading-state',
}) => {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      data-testid={testId}
      className={`flex h-full w-full flex-col justify-between p-4 md:p-6 transition-colors ${className}`}
    >
      <span className="sr-only">{message}</span>

      {/* ── Variant 1: Chat Workspace Skeleton ────────────────────────── */}
      {variant === 'chat' && (
        <div aria-hidden="true" className="flex h-full w-full flex-col justify-between gap-6">
          {/* Messages Stream Placeholder */}
          <div className="space-y-6 flex-1 overflow-hidden">
            {/* Assistant Message Bubble Skeleton */}
            <div className="flex items-start gap-3 max-w-2xl">
              <Skeleton className="h-9 w-9 rounded-xl shrink-0 motion-reduce:animate-none" />
              <div className="space-y-2 flex-1 rounded-2xl rounded-tl-sm border border-border/40 bg-card/60 p-4">
                <Skeleton className="h-4 w-3/4 motion-reduce:animate-none" />
                <Skeleton className="h-3.5 w-full motion-reduce:animate-none" />
                <Skeleton className="h-3.5 w-5/6 motion-reduce:animate-none" />
                <div className="pt-2 flex gap-2">
                  <Skeleton className="h-5 w-24 rounded-full motion-reduce:animate-none" />
                  <Skeleton className="h-5 w-20 rounded-full motion-reduce:animate-none" />
                </div>
              </div>
            </div>

            {/* User Message Bubble Skeleton (Right-aligned) */}
            <div className="flex justify-end">
              <div className="w-full max-w-md space-y-2 rounded-2xl rounded-tr-sm bg-primary/10 border border-primary/20 p-4">
                <Skeleton className="h-4 w-2/3 ml-auto motion-reduce:animate-none" />
                <Skeleton className="h-3.5 w-4/5 ml-auto motion-reduce:animate-none" />
              </div>
            </div>

            {/* Assistant Second Turn Skeleton */}
            <div className="flex items-start gap-3 max-w-xl">
              <Skeleton className="h-9 w-9 rounded-xl shrink-0 motion-reduce:animate-none" />
              <div className="space-y-2 flex-1 rounded-2xl rounded-tl-sm border border-border/40 bg-card/60 p-4">
                <Skeleton className="h-4 w-1/2 motion-reduce:animate-none" />
                <Skeleton className="h-3.5 w-4/5 motion-reduce:animate-none" />
              </div>
            </div>
          </div>

          {/* Bottom Composer Skeleton Bar */}
          <div className="shrink-0 rounded-xl border border-border/60 bg-card/60 p-3 flex items-center justify-between gap-3">
            <Skeleton className="h-8 flex-1 rounded-lg motion-reduce:animate-none" />
            <Skeleton className="h-8 w-10 rounded-lg shrink-0 motion-reduce:animate-none" />
          </div>
        </div>
      )}

      {/* ── Variant 2: Conversation List / Sidebar Skeleton ──────────── */}
      {variant === 'conversation-list' && (
        <div
          aria-hidden="true"
          className="space-y-4 w-full p-1"
          data-testid="conversation-list-skeleton"
        >
          {/* Section 1 header skeleton */}
          <Skeleton className="h-3 w-16 mb-2 motion-reduce:animate-none" />
          <div className="space-y-2">
            {[1, 2, 3].map((idx) => (
              <div
                key={`sidebar-skeleton-item-${idx}`}
                className="flex items-center gap-2.5 rounded-lg border border-border/30 bg-card/30 p-2.5"
              >
                <Skeleton className="h-4 w-4 rounded-sm shrink-0 motion-reduce:animate-none" />
                <div className="flex-1 space-y-1.5 min-w-0">
                  <Skeleton
                    className={`h-3.5 ${idx % 2 === 0 ? 'w-4/5' : 'w-2/3'} motion-reduce:animate-none`}
                  />
                  <Skeleton className="h-2.5 w-1/3 motion-reduce:animate-none" />
                </div>
              </div>
            ))}
          </div>

          {/* Section 2 header skeleton */}
          <Skeleton className="h-3 w-20 mt-4 mb-2 motion-reduce:animate-none" />
          <div className="space-y-2">
            {[4, 5].map((idx) => (
              <div
                key={`sidebar-skeleton-item-${idx}`}
                className="flex items-center gap-2.5 rounded-lg border border-border/30 bg-card/30 p-2.5"
              >
                <Skeleton className="h-4 w-4 rounded-sm shrink-0 motion-reduce:animate-none" />
                <div className="flex-1 space-y-1.5 min-w-0">
                  <Skeleton className="h-3.5 w-3/4 motion-reduce:animate-none" />
                  <Skeleton className="h-2.5 w-2/5 motion-reduce:animate-none" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Variant 3: Knowledge Center / Document Library Skeleton ───── */}
      {variant === 'knowledge' && (
        <div aria-hidden="true" className="space-y-6 w-full">
          {/* Search & Actions Toolbar Skeleton */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pb-2 border-b border-border/40">
            <Skeleton className="h-9 w-full sm:w-72 rounded-lg motion-reduce:animate-none" />
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Skeleton className="h-9 w-28 rounded-lg motion-reduce:animate-none" />
              <Skeleton className="h-9 w-32 rounded-lg motion-reduce:animate-none" />
            </div>
          </div>

          {/* Document Cards Grid Skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={`knowledge-skeleton-card-${i}`}
                className="rounded-xl border border-border/60 bg-card/40 p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <Skeleton className="h-8 w-8 rounded-lg shrink-0 motion-reduce:animate-none" />
                  <Skeleton className="h-5 w-20 rounded-full motion-reduce:animate-none" />
                </div>
                <Skeleton className="h-4 w-4/5 motion-reduce:animate-none" />
                <Skeleton className="h-3 w-3/5 motion-reduce:animate-none" />
                <div className="pt-2 border-t border-border/30 flex justify-between items-center">
                  <Skeleton className="h-3 w-24 motion-reduce:animate-none" />
                  <Skeleton className="h-3 w-16 motion-reduce:animate-none" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Variant 4: Generic Page Skeleton ─────────────────────────── */}
      {variant === 'page' && (
        <div aria-hidden="true" className="space-y-6 w-full">
          <div className="space-y-2 pb-4 border-b border-border/40">
            <Skeleton className="h-6 w-56 motion-reduce:animate-none" />
            <Skeleton className="h-3.5 w-96 max-w-full motion-reduce:animate-none" />
          </div>
          <div className="rounded-xl border border-dashed border-border/60 bg-card/30 p-8 space-y-4">
            <Skeleton className="h-10 w-10 rounded-xl mx-auto motion-reduce:animate-none" />
            <Skeleton className="h-4 w-48 mx-auto motion-reduce:animate-none" />
            <Skeleton className="h-3.5 w-80 max-w-full mx-auto motion-reduce:animate-none" />
          </div>
        </div>
      )}
    </div>
  );
};
