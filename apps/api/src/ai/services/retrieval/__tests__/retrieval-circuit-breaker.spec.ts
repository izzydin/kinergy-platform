import {
  RetrievalCircuitBreaker,
  CircuitBreakerOpenException,
  CircuitBreakerTimeoutException,
  CircuitBreakerConcurrencyException,
} from '../retrieval-circuit-breaker';

describe('AI-07.5 — RetrievalCircuitBreaker Unit Tests', () => {
  const defaultConfig = {
    failureThreshold: 3,
    recoveryIntervalMs: 100, // short for fast test execution
    timeoutMs: 50,
    maxConcurrentRequests: 2,
  };

  it('1. should execute normally in CLOSED state and return result', async () => {
    const cb = new RetrievalCircuitBreaker(defaultConfig);

    const result = await cb.execute(async () => 'success_value');

    expect(result).toBe('success_value');
    expect(cb.getState()).toBe('CLOSED');
    expect(cb.getStats().consecutiveFailures).toBe(0);
  });

  it('2. should trip to OPEN after consecutive failures reach failureThreshold', async () => {
    const cb = new RetrievalCircuitBreaker(defaultConfig);

    const failingOp = async () => {
      throw new Error('Inference node unreachable');
    };

    // 1st failure
    await expect(cb.execute(failingOp)).rejects.toThrow('Inference node unreachable');
    expect(cb.getState()).toBe('CLOSED');
    expect(cb.getStats().consecutiveFailures).toBe(1);

    // 2nd failure
    await expect(cb.execute(failingOp)).rejects.toThrow('Inference node unreachable');
    expect(cb.getState()).toBe('CLOSED');
    expect(cb.getStats().consecutiveFailures).toBe(2);

    // 3rd failure - trips to OPEN
    await expect(cb.execute(failingOp)).rejects.toThrow('Inference node unreachable');
    expect(cb.getState()).toBe('OPEN');
    expect(cb.getStats().consecutiveFailures).toBe(3);
  });

  it('3. should fast-fail in OPEN state without calling the operation', async () => {
    const cb = new RetrievalCircuitBreaker(defaultConfig);
    const mockOp = jest.fn().mockRejectedValue(new Error('Downstream error'));

    // Trip the circuit breaker
    for (let i = 0; i < 3; i++) {
      try {
        await cb.execute(mockOp);
      } catch {
        // expected
      }
    }
    expect(cb.getState()).toBe('OPEN');
    mockOp.mockClear();

    // Now request should fast-fail immediately
    await expect(cb.execute(mockOp)).rejects.toThrow(CircuitBreakerOpenException);
    expect(mockOp).not.toHaveBeenCalled();
  });

  it('4. should transition to HALF_OPEN after recoveryIntervalMs has elapsed', async () => {
    const cb = new RetrievalCircuitBreaker(defaultConfig);
    for (let i = 0; i < 3; i++) {
      try {
        await cb.execute(async () => {
          throw new Error('err');
        });
      } catch {
        // expected
      }
    }
    expect(cb.getState()).toBe('OPEN');

    // Wait for recovery interval (100ms + buffer)
    await new Promise((r) => setTimeout(r, 120));

    expect(cb.getState()).toBe('HALF_OPEN');
  });

  it('5. should reset to CLOSED on successful canary request in HALF_OPEN state', async () => {
    const cb = new RetrievalCircuitBreaker(defaultConfig);
    for (let i = 0; i < 3; i++) {
      try {
        await cb.execute(async () => {
          throw new Error('err');
        });
      } catch {
        // expected
      }
    }
    await new Promise((r) => setTimeout(r, 120));
    expect(cb.getState()).toBe('HALF_OPEN');

    // Canary succeeds
    const result = await cb.execute(async () => 'canary_recovered');

    expect(result).toBe('canary_recovered');
    expect(cb.getState()).toBe('CLOSED');
    expect(cb.getStats().consecutiveFailures).toBe(0);
  });

  it('6. should re-trip to OPEN if canary request fails in HALF_OPEN state', async () => {
    const cb = new RetrievalCircuitBreaker(defaultConfig);
    for (let i = 0; i < 3; i++) {
      try {
        await cb.execute(async () => {
          throw new Error('err');
        });
      } catch {
        // expected
      }
    }
    await new Promise((r) => setTimeout(r, 120));
    expect(cb.getState()).toBe('HALF_OPEN');

    // Canary fails
    await expect(
      cb.execute(async () => {
        throw new Error('Canary failed');
      }),
    ).rejects.toThrow('Canary failed');

    expect(cb.getState()).toBe('OPEN');
  });

  it('7. should enforce timeout and abort signal', async () => {
    const cb = new RetrievalCircuitBreaker({
      ...defaultConfig,
      timeoutMs: 30,
    });

    let wasAborted = false;
    const slowOp = async (signal: AbortSignal) => {
      return new Promise<string>((resolve, reject) => {
        signal.addEventListener('abort', () => {
          wasAborted = true;
          reject(new Error('Aborted by signal'));
        });
        setTimeout(() => resolve('too_late'), 100);
      });
    };

    await expect(cb.execute(slowOp)).rejects.toThrow(CircuitBreakerTimeoutException);
    expect(wasAborted).toBe(true);
  });

  it('8. should reject when concurrent requests exceed maxConcurrentRequests', async () => {
    const cb = new RetrievalCircuitBreaker({
      ...defaultConfig,
      maxConcurrentRequests: 1, // Only 1 concurrent request allowed
      timeoutMs: 200,
    });

    let finishFirst: () => void = () => {};
    const firstPromise = new Promise<string>((resolve) => {
      finishFirst = () => resolve('first_done');
    });

    // Start 1st request
    const p1 = cb.execute(async () => firstPromise);

    // 2nd request immediately while 1st is still active
    await expect(cb.execute(async () => 'second')).rejects.toThrow(
      CircuitBreakerConcurrencyException,
    );

    // Complete first
    finishFirst();
    await expect(p1).resolves.toBe('first_done');
  });

  it('9. should reset state and failure counters when reset() is invoked', async () => {
    const cb = new RetrievalCircuitBreaker(defaultConfig);
    for (let i = 0; i < 3; i++) {
      try {
        await cb.execute(async () => {
          throw new Error('err');
        });
      } catch {
        // expected
      }
    }
    expect(cb.getState()).toBe('OPEN');

    cb.reset();

    expect(cb.getState()).toBe('CLOSED');
    expect(cb.getStats().consecutiveFailures).toBe(0);
  });
});
