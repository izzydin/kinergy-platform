import { PrismaClient } from '@prisma/client';
import { IUnitOfWork } from '../../../../application/ports/unit-of-work.port';
import { SalesTransactionCoordinatorPort } from '../../../../application/ports/sales-transaction-coordinator.port';

interface AsyncLocalStorageLike<T> {
  getStore(): T | undefined;
  run<R>(store: T, callback: () => R): R;
}

// Dynamically resolve AsyncLocalStorage in Node.js runtime without static type dependency on node types
let globalStorage: AsyncLocalStorageLike<unknown> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globalRef = globalThis as unknown as {
    AsyncLocalStorage?: new <T>() => AsyncLocalStorageLike<T>;
  };
  if (typeof globalRef.AsyncLocalStorage === 'function') {
    globalStorage = new globalRef.AsyncLocalStorage();
  } else if (typeof Function === 'function') {
    // Dynamic require without static module resolution error during library compilation
    const dynamicRequire = new Function('moduleName', 'return require(moduleName)');
    const asyncHooks = dynamicRequire('async_hooks');
    if (asyncHooks && typeof asyncHooks.AsyncLocalStorage === 'function') {
      globalStorage = new asyncHooks.AsyncLocalStorage();
    }
  }
} catch {
  // Fallback for runtimes without async_hooks
  globalStorage = null;
}

let fallbackActiveStore: unknown = null;

/**
 * Infrastructure implementation of IUnitOfWork for the Sales & Payments Bounded Context.
 * Uses Prisma Client's $transaction with Node.js AsyncLocalStorage for ambient context propagation.
 * Preserves Clean Architecture by keeping database transaction mechanisms isolated to infrastructure.
 */
export class PrismaSalesUnitOfWork implements IUnitOfWork, SalesTransactionCoordinatorPort {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Resolves the active ambient transaction client if executing within a unit-of-work context.
   */
  public static getCurrentTransactionClient(): unknown | null {
    if (globalStorage) {
      return globalStorage.getStore() ?? null;
    }
    return fallbackActiveStore;
  }

  /**
   * Executes a unit of work inside an atomic database transaction.
   * Discards all staged persistence changes upon any unhandled exception.
   */
  public async executeInTransaction<T>(work: () => Promise<T>): Promise<T> {
    const runInScope = async (tx: unknown): Promise<T> => {
      if (globalStorage) {
        return globalStorage.run(tx, () => work());
      }
      const prior = fallbackActiveStore;
      fallbackActiveStore = tx;
      try {
        return await work();
      } finally {
        fallbackActiveStore = prior;
      }
    };

    // 1. If this.prisma already provides its own runInTransaction (e.g., NestJS PrismaService):
    if (
      typeof (this.prisma as unknown as { runInTransaction?: unknown }).runInTransaction ===
      'function'
    ) {
      return (
        this.prisma as unknown as {
          runInTransaction: (fn: (tx: unknown) => Promise<T>) => Promise<T>;
        }
      ).runInTransaction(async (tx) => {
        return runInScope(tx);
      });
    }

    // 2. If this.prisma is already an active interactive transaction client (no $transaction method):
    if (typeof (this.prisma as unknown as { $transaction?: unknown }).$transaction !== 'function') {
      return runInScope(this.prisma);
    }

    // 3. Standard Prisma Client $transaction
    return (
      this.prisma as unknown as {
        $transaction: (cb: (tx: unknown) => Promise<T>) => Promise<T>;
      }
    ).$transaction(async (tx) => {
      return runInScope(tx);
    });
  }

  /**
   * Alias for executeInTransaction to satisfy SalesTransactionCoordinatorPort.
   */
  public async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    return this.executeInTransaction(work);
  }
}
