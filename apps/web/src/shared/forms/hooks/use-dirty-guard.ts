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
 * Prevents accidental navigation away from a page form that has unsaved changes.
 * Covers two surfaces:
 *
 * 1. **Internal route transitions** — uses React Router v6 `useBlocker` to intercept
 *    programmatic and link-driven navigation. When a transition is blocked, `isBlocked`
 *    becomes true — render `<ConfirmDiscardDialog>` to let the user decide.
 *
 * 2. **Browser close / refresh** — adds a `beforeunload` event listener when the form
 *    is dirty. The browser renders its own native "Leave site?" prompt. We cannot
 *    customise the message per modern browser policy.
 *
 * **Safety invariants — the guard NEVER blocks when:**
 * - `isSubmitSuccessful` is `true`
 * - `isDirty` is `false`
 *
 * **For dialog forms** use `useDirtyDialogGuard` instead. That hook intercepts the
 * dialog's `onOpenChange` rather than router transitions.
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
}: DirtyGuardOptions): DirtyGuardResult {
  // Guard is active only when the form is dirty AND not yet successfully submitted.
  const shouldBlock = isDirty && !isSubmitSuccessful;

  // React Router v6 useBlocker — intercepts internal route transitions.
  const blocker = useBlocker(shouldBlock);

  // Browser close / refresh guard
  useEffect(() => {
    if (!shouldBlock) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // Modern browsers require returnValue to be set to show the prompt.
      event.preventDefault();
      // Legacy browsers (and some modern ones) still check returnValue.
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
