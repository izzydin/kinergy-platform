import { renderHook } from '@testing-library/react';
import { type FieldValues, type Path, type UseFormSetError } from 'react-hook-form';
import { ValidationError } from '../../query';
import { useApplyServerErrors } from '../hooks/use-apply-server-errors';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TestForm extends FieldValues {
  email: string;
  name: string;
}

function makeSetError(): {
  calls: Array<[string, { type: string; message: string }]>;
  fn: UseFormSetError<TestForm>;
} {
  const calls: Array<[string, { type: string; message: string }]> = [];
  const fn = (field: Path<TestForm>, error: { type: string; message: string }) => {
    calls.push([field as string, error]);
  };
  return { calls, fn: fn as unknown as UseFormSetError<TestForm> };
}

function makeValidationError(details: Record<string, string[]>): ValidationError {
  return new ValidationError('Validation failed', details);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useApplyServerErrors', () => {
  it('maps single field error correctly', () => {
    const { calls, fn } = makeSetError();
    const { result } = renderHook(() => useApplyServerErrors<TestForm>(fn));
    const error = makeValidationError({ email: ['must be a valid email'] });

    result.current(error);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe('email');
    expect(calls[0]?.[1]).toEqual({ type: 'server', message: 'must be a valid email' });
  });

  it('combines multiple messages for the same field into one string', () => {
    const { calls, fn } = makeSetError();
    const { result } = renderHook(() => useApplyServerErrors<TestForm>(fn));
    const error = makeValidationError({
      name: ['must be at least 2 characters', 'must be a string'],
    });

    result.current(error);

    expect(calls[0]?.[1]?.message).toBe('must be at least 2 characters. must be a string');
  });

  it('handles multiple fields in a single error', () => {
    const { calls, fn } = makeSetError();
    const { result } = renderHook(() => useApplyServerErrors<TestForm>(fn));
    const error = makeValidationError({
      email: ['invalid email'],
      name: ['too short'],
    });

    result.current(error);

    expect(calls).toHaveLength(2);
    expect(calls.map((c) => c[0])).toContain('email');
    expect(calls.map((c) => c[0])).toContain('name');
  });

  it('does nothing when error.details is undefined', () => {
    const { calls, fn } = makeSetError();
    const { result } = renderHook(() => useApplyServerErrors<TestForm>(fn));
    const error = new ValidationError('Validation failed');
    // details not set

    result.current(error);

    expect(calls).toHaveLength(0);
  });

  it('does nothing when error.details is empty object', () => {
    const { calls, fn } = makeSetError();
    const { result } = renderHook(() => useApplyServerErrors<TestForm>(fn));
    const error = makeValidationError({});

    result.current(error);

    expect(calls).toHaveLength(0);
  });

  it('skips fields with empty message arrays', () => {
    const { calls, fn } = makeSetError();
    const { result } = renderHook(() => useApplyServerErrors<TestForm>(fn));
    const error = makeValidationError({ email: [] });

    result.current(error);

    expect(calls).toHaveLength(0);
  });

  it('returns a stable function reference across re-renders', () => {
    const { fn } = makeSetError();
    const { result, rerender } = renderHook(() => useApplyServerErrors<TestForm>(fn));
    const firstRef = result.current;
    rerender();
    expect(result.current).toBe(firstRef);
  });
});
