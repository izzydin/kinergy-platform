import { act, renderHook } from '@testing-library/react';
import { useDirtyDialogGuard } from '../hooks/use-dirty-dialog-guard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setup(options: { isDirty: boolean; isSubmitSuccessful: boolean }) {
  const onClose = jest.fn();
  const { result, rerender } = renderHook(
    (props) =>
      useDirtyDialogGuard({
        isDirty: props.isDirty,
        isSubmitSuccessful: props.isSubmitSuccessful,
        onClose,
      }),
    { initialProps: { ...options, onClose } },
  );
  return { result, rerender, onClose };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useDirtyDialogGuard', () => {
  it('closes immediately when form is clean', () => {
    const { result, onClose } = setup({ isDirty: false, isSubmitSuccessful: false });

    act(() => result.current.guardedOnOpenChange(false));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(result.current.isConfirmOpen).toBe(false);
  });

  it('closes immediately when form is dirty but already submitted successfully', () => {
    const { result, onClose } = setup({ isDirty: true, isSubmitSuccessful: true });

    act(() => result.current.guardedOnOpenChange(false));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(result.current.isConfirmOpen).toBe(false);
  });

  it('shows confirm dialog when form is dirty and not submitted', () => {
    const { result, onClose } = setup({ isDirty: true, isSubmitSuccessful: false });

    act(() => result.current.guardedOnOpenChange(false));

    expect(onClose).not.toHaveBeenCalled();
    expect(result.current.isConfirmOpen).toBe(true);
  });

  it('does not intercept when opening the dialog (nextOpen = true)', () => {
    const { result, onClose } = setup({ isDirty: true, isSubmitSuccessful: false });

    act(() => result.current.guardedOnOpenChange(true));

    expect(onClose).not.toHaveBeenCalled();
    expect(result.current.isConfirmOpen).toBe(false);
  });

  it('confirmDiscard closes confirm modal and calls onClose', () => {
    const { result, onClose } = setup({ isDirty: true, isSubmitSuccessful: false });

    act(() => result.current.guardedOnOpenChange(false));
    expect(result.current.isConfirmOpen).toBe(true);

    act(() => result.current.confirmDiscard());

    expect(result.current.isConfirmOpen).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('cancelDiscard closes confirm modal without calling onClose', () => {
    const { result, onClose } = setup({ isDirty: true, isSubmitSuccessful: false });

    act(() => result.current.guardedOnOpenChange(false));
    act(() => result.current.cancelDiscard());

    expect(result.current.isConfirmOpen).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('returns stable function references across re-renders', () => {
    const { result, rerender, onClose } = setup({ isDirty: false, isSubmitSuccessful: false });

    const first = {
      guardedOnOpenChange: result.current.guardedOnOpenChange,
      confirmDiscard: result.current.confirmDiscard,
      cancelDiscard: result.current.cancelDiscard,
    };

    rerender({ isDirty: false, isSubmitSuccessful: false, onClose });

    expect(result.current.guardedOnOpenChange).toBe(first.guardedOnOpenChange);
    expect(result.current.confirmDiscard).toBe(first.confirmDiscard);
    expect(result.current.cancelDiscard).toBe(first.cancelDiscard);
  });
});
