import { Result } from './result';

describe('Result Monad', () => {
  it('should create a successful result with value', () => {
    const value = 'Operation successful';
    const result = Result.ok(value);

    expect(result.isSuccess).toBe(true);
    expect(result.isFailure).toBe(false);
    expect(result.getValue()).toBe(value);
  });

  it('should throw an error when accessing getError on a success result', () => {
    const result = Result.ok('success');
    expect(() => result.getError()).toThrow('Can not get the error of a success result.');
  });

  it('should create a failure result with error', () => {
    const error = new Error('Operation failed');
    const result = Result.fail(error);

    expect(result.isSuccess).toBe(false);
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBe(error);
  });

  it('should throw an error when accessing getValue on a failure result', () => {
    const result = Result.fail(new Error('failure'));
    expect(() => result.getValue()).toThrow(
      'Can not get the value of an error result. Use getError() instead.',
    );
  });

  it('should combine multiple successful results', () => {
    const res1 = Result.ok('one');
    const res2 = Result.ok('two');
    const combined = Result.combine([res1, res2]);

    expect(combined.isSuccess).toBe(true);
  });

  it('should return the first failure when combining results containing a failure', () => {
    const res1 = Result.ok('one');
    const failureErr = new Error('First failure');
    const res2 = Result.fail(failureErr);
    const res3 = Result.ok('three');

    const combined = Result.combine([res1, res2, res3]);
    expect(combined.isFailure).toBe(true);
    expect(combined.getError()).toBe(failureErr);
  });
});
