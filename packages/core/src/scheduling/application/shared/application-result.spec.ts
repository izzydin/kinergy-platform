import { ApplicationResult } from './application-result';

describe('ApplicationResult Container', () => {
  it('should create a successful result with ok()', () => {
    const result = ApplicationResult.ok<string>('Success Value');

    expect(result.isSuccess).toBe(true);
    expect(result.isFailure).toBe(false);
    expect(result.getValue()).toBe('Success Value');
    expect(() => result.getError()).toThrow(
      'Cannot retrieve error from a successful ApplicationResult.',
    );
  });

  it('should create a failed result with fail()', () => {
    const result = ApplicationResult.fail<string>('Validation Error');

    expect(result.isSuccess).toBe(false);
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBe('Validation Error');
    expect(() => result.getValue()).toThrow(
      'Cannot retrieve value from a failed ApplicationResult.',
    );
  });

  it('should be immutable and call Object.freeze()', () => {
    const result = ApplicationResult.ok<number>(42);
    expect(Object.isFrozen(result)).toBe(true);
  });
});
