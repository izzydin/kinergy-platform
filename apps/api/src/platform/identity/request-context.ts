import { AsyncLocalStorage } from 'async_hooks';
import { IUserIdentity } from './user-identity.interface';

/**
 * Pure TypeScript RequestContext powered by Node.js AsyncLocalStorage.
 * Encapsulates the current execution request context (authenticated identity, permissions, tenantId)
 * across asynchronous execution call chains without parameter pollution.
 */
export class RequestContext {
  private static readonly storage = new AsyncLocalStorage<IUserIdentity>();

  /**
   * Execute an asynchronous callback within a specified IUserIdentity context.
   */
  public static run<R>(identity: IUserIdentity, callback: () => R): R {
    return this.storage.run(identity, callback);
  }

  /**
   * Retrieve the current active IUserIdentity from the AsyncLocalStorage store.
   * Returns null if no context has been initialized for the current request thread.
   */
  public static currentIdentity(): IUserIdentity | null {
    return this.storage.getStore() ?? null;
  }
}
