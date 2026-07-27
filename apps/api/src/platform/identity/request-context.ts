import { AsyncLocalStorage } from 'async_hooks';
import { AuthenticatedUserContext } from './context/authenticated-user-context';
import { IUserIdentity } from './user-identity.interface';

/**
 * RequestContext powered by Node.js AsyncLocalStorage.
 * Manages the active execution request context (AuthenticatedUserContext)
 * across asynchronous execution call chains without parameter pollution.
 */
export class RequestContext {
  private static readonly storage = new AsyncLocalStorage<AuthenticatedUserContext>();

  /**
   * Execute an asynchronous callback within a specified AuthenticatedUserContext or IUserIdentity.
   */
  public static run<R>(
    contextOrIdentity: AuthenticatedUserContext | IUserIdentity,
    callback: () => R,
  ): R {
    const context =
      contextOrIdentity instanceof AuthenticatedUserContext
        ? contextOrIdentity
        : new AuthenticatedUserContext({
            userId: contextOrIdentity.userId,
            email: contextOrIdentity.email,
            status: 'ACTIVE',
            roles: contextOrIdentity.roles,
            permissions: contextOrIdentity.permissions,
            tenantId: contextOrIdentity.tenantId,
            metadata: contextOrIdentity.metadata,
          });

    return this.storage.run(context, callback);
  }

  /**
   * Retrieve the current active AuthenticatedUserContext from the AsyncLocalStorage store.
   * Returns null if no context has been initialized for the current request thread.
   */
  public static currentContext(): AuthenticatedUserContext | null {
    return this.storage.getStore() ?? null;
  }

  /**
   * Backward-compatible helper method returning IUserIdentity structure.
   */
  public static currentIdentity(): IUserIdentity | null {
    const ctx = this.currentContext();
    if (!ctx) return null;
    return {
      userId: ctx.userId,
      email: ctx.email,
      roles: [...ctx.roles],
      permissions: [...ctx.permissions],
      tenantId: ctx.tenantId,
      metadata:
        ctx.metadata && Object.keys(ctx.metadata).length > 0 ? { ...ctx.metadata } : undefined,
    };
  }
}
