import { IUserIdentity } from './user-identity.interface';

export interface IIdentityContext {
  getCurrentUser(): IUserIdentity | null;
  isAuthenticated(): boolean;
}

export const IDENTITY_CONTEXT = Symbol('IIdentityContext');
