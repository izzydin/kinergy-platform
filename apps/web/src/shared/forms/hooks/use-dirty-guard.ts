import { useCallback, useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

export interface DirtyGuardOptions {
  /**
   * Whether the form currently has unsaved changes.
   * Should come directly from `formState.isDirty` (React Hook Form).
   */
  isDirty: boolean;
  /**
   * Whether the form has been submitted successfully.
   * Should come directly from `formState.isSubmitSuccessful`.
   * When true, the guard is deactivated regardless of `isDirty`.
   */
  isSubmitSuccessful: boolean;
  /**
   * Optional toggle to enable or disable the guard.
   * @default true
   */
  enabled?: boolean;
}

export interface DirtyGuardResult {
  /**
   * Whether navigation is currently being blocked (guard is active and a transition was attempted).
   * When true, render `<ConfirmDiscardDialog open={isBlocked} ... />`.
   */
  isBlocked: boolean;
  /**
   * Proceed with the blocked navigation (discard changes and navigate away).
   * Call this from `ConfirmDiscardDialog.onConfirm`.
   */
  proceed: () => void;
  /**
   * Cancel the blocked navigation (stay on the page, keep editing).
   * Call this from `ConfirmDiscardDialog.onCancel`.
   */
  reset: () => void;
}

/**
 * useDirtyGuard
 *
 * Prevents accidental loss of unsaved changes in page-level forms.
 * Covers two critical navigation vectors:
 *
 * 1. **Internal route transitions** — Uses React Router v6 `useBlocker` to intercept
 *    programmatic and link-driven navigation. When a transition is blocked, `isBlocked`
 *    becomes true — render `<ConfirmDiscardDialog>` to prompt the user.
 *
 * 2. **Browser close / refresh / reload** — Attaches a `beforeunload` listener to `window`
 *    only while the form is dirty and not yet successfully submitted.
 *
 * **Safety invariants — the guard NEVER blocks when:**
 * - `isSubmitSuccessful` is `true`
 * - `isDirty` is `false`
 * - `enabled` is `false`
 *
 * **Listener lifecycle:**
 * - `beforeunload` is registered strictly while `shouldBlock` is true.
 * - Listener is cleaned up immediately when the form becomes clean, submits, or unmounts.
 *
 * **For dialog forms:**
 * Use `useDirtyDialogGuard` instead, which intercepts modal dialog `onOpenChange(false)`
 * closures rather than top-level routing transitions.
 *
 * @example
 * ```tsx
 * const { formState: { isDirty, isSubmitSuccessful } } = useForm<MyForm>();
 * const { isBlocked, proceed, reset } = useDirtyGuard({ isDirty, isSubmitSuccessful });
 *
 * return (
 *   <>
 *     <form ...>...</form>
 *     <ConfirmDiscardDialog open={isBlocked} onConfirm={proceed} onCancel={reset} />
 *   </>
 * );
 * ```
 */
export function useDirtyGuard({
  isDirty,
  isSubmitSuccessful,
  enabled = true,
}: DirtyGuardOptions): DirtyGuardResult {
  const shouldBlock = Boolean(enabled && isDirty && !isSubmitSuccessful);

  // React Router v6 useBlocker with boolean flag
  const blocker = useBlocker(shouldBlock);

  // Browser close / refresh guard
  useEffect(() => {
    if (!shouldBlock) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [shouldBlock]);

  const proceed = useCallback(() => {
    if (blocker.state === 'blocked') {
      blocker.proceed();
    }
  }, [blocker]);

  const reset = useCallback(() => {
    if (blocker.state === 'blocked') {
      blocker.reset();
    }
  }, [blocker]);

  return {
    isBlocked: blocker.state === 'blocked',
    proceed,
    reset,
  };
}
