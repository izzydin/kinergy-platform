import { Logger } from '@nestjs/common';

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  readonly failureThreshold: number;
  readonly recoveryIntervalMs: number;
  readonly timeoutMs: number;
  readonly maxConcurrentRequests: number;
}

export class CircuitBreakerOpenException extends Error {
  constructor(message = 'Circuit breaker is OPEN. Fast-failing request.') {
    super(message);
    this.name = 'CircuitBreakerOpenException';
  }
}

export class CircuitBreakerTimeoutException extends Error {
  constructor(message = 'Operation timed out under circuit breaker protection.') {
    super(message);
    this.name = 'CircuitBreakerTimeoutException';
  }
}

export class CircuitBreakerConcurrencyException extends Error {
  constructor(message = 'Circuit breaker concurrent request limit exceeded.') {
    super(message);
    this.name = 'CircuitBreakerConcurrencyException';
  }
}

/**
 * Resilient, provider-agnostic Circuit Breaker with hard timeout enforcement
 * and concurrent request limiting for latency-sensitive AI retrieval pipelines.
 *
 * State Machine:
 * - CLOSED: Normal operation. Tracks consecutive failures.
 * - OPEN: Fast-fails requests without invoking downstream inference until recovery interval elapses.
 * - HALF_OPEN: Allows a single canary request to test recovery.
 */
export class RetrievalCircuitBreaker {
  private readonly logger = new Logger(RetrievalCircuitBreaker.name);
  private state: CircuitBreakerState = 'CLOSED';
  private consecutiveFailures = 0;
  private nextAttemptTimestamp = 0;
  private activeConcurrentRequests = 0;

  constructor(private readonly config: CircuitBreakerConfig) {
    if (config.failureThreshold < 1) {
      throw new Error(`failureThreshold must be >= 1, received: ${config.failureThreshold}`);
    }
    if (config.recoveryIntervalMs <= 0) {
      throw new Error(`recoveryIntervalMs must be > 0, received: ${config.recoveryIntervalMs}`);
    }
    if (config.timeoutMs <= 0) {
      throw new Error(`timeoutMs must be > 0, received: ${config.timeoutMs}`);
    }
    if (config.maxConcurrentRequests < 1) {
      throw new Error(
        `maxConcurrentRequests must be >= 1, received: ${config.maxConcurrentRequests}`,
      );
    }
  }

  public getState(): CircuitBreakerState {
    this.checkStateTransition();
    return this.state;
  }

  public getStats() {
    return {
      state: this.getState(),
      consecutiveFailures: this.consecutiveFailures,
      activeConcurrentRequests: this.activeConcurrentRequests,
      nextAttemptTimestamp: this.nextAttemptTimestamp,
    };
  }

  public reset(): void {
    this.state = 'CLOSED';
    this.consecutiveFailures = 0;
    this.nextAttemptTimestamp = 0;
    this.activeConcurrentRequests = 0;
  }

  /**
   * Executes an asynchronous operation wrapped with state protection,
   * timeout racing, and concurrency limits.
   */
  public async execute<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    parentSignal?: AbortSignal,
  ): Promise<T> {
    this.checkStateTransition();

    if (this.state === 'OPEN') {
      throw new CircuitBreakerOpenException(
        `Circuit breaker is OPEN. Recovery attempt allowed in ${Math.max(0, this.nextAttemptTimestamp - Date.now())}ms.`,
      );
    }

    if (this.activeConcurrentRequests >= this.config.maxConcurrentRequests) {
      throw new CircuitBreakerConcurrencyException(
        `Max concurrent requests (${this.config.maxConcurrentRequests}) exceeded for reranker.`,
      );
    }

    this.activeConcurrentRequests++;
    const abortController = new AbortController();

    // Wire up parent abort signal if provided
    let parentAbortHandler: (() => void) | undefined;
    if (parentSignal) {
      if (parentSignal.aborted) {
        this.activeConcurrentRequests--;
        throw new Error('Operation aborted prior to execution.');
      }
      parentAbortHandler = () => abortController.abort();
      parentSignal.addEventListener('abort', parentAbortHandler, { once: true });
    }

    // Hard timeout timer
    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        abortController.abort();
        reject(
          new CircuitBreakerTimeoutException(
            `Operation timed out after ${this.config.timeoutMs}ms limit.`,
          ),
        );
      }, this.config.timeoutMs);
    });

    try {
      const result = await Promise.race([operation(abortController.signal), timeoutPromise]);

      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
      if (parentSignal && parentAbortHandler) {
        parentSignal.removeEventListener('abort', parentAbortHandler);
      }
      this.activeConcurrentRequests--;
    }
  }

  private checkStateTransition(): void {
    if (this.state === 'OPEN' && Date.now() >= this.nextAttemptTimestamp) {
      this.state = 'HALF_OPEN';
      this.logger.log('Circuit breaker transitioned to HALF_OPEN. Allowing trial canary request.');
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN' || this.consecutiveFailures > 0) {
      this.logger.log(
        `Circuit breaker restored to CLOSED. Consecutive failures reset from ${this.consecutiveFailures} to 0.`,
      );
    }
    this.state = 'CLOSED';
    this.consecutiveFailures = 0;
  }

  private onFailure(error: unknown): void {
    this.consecutiveFailures++;
    const errorMsg = error instanceof Error ? error.message : String(error);

    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.nextAttemptTimestamp = Date.now() + this.config.recoveryIntervalMs;
      this.logger.warn(
        `Trial canary request in HALF_OPEN state failed: ${errorMsg}. Re-opening circuit for ${this.config.recoveryIntervalMs}ms.`,
      );
      return;
    }

    if (this.consecutiveFailures >= this.config.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttemptTimestamp = Date.now() + this.config.recoveryIntervalMs;
      this.logger.warn(
        `Consecutive failures reached threshold (${this.consecutiveFailures}/${this.config.failureThreshold}). Circuit breaker tripped to OPEN for ${this.config.recoveryIntervalMs}ms. Last error: ${errorMsg}`,
      );
    }
  }
}
