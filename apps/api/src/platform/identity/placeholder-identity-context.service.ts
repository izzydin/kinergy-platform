import { Injectable } from '@nestjs/common';
import { IIdentityContext } from './identity-context.interface';
import { RequestContext } from './request-context';
import { IUserIdentity } from './user-identity.interface';

@Injectable()
export class PlaceholderIdentityContextService implements IIdentityContext {
  private readonly fallbackUser: IUserIdentity = {
    userId: 'system-placeholder-user-id',
    email: 'system@kinergy-platform.local',
    roles: ['Owner'],
    permissions: ['*:*:*'],
    tenantId: 'system-placeholder-tenant-id',
  };

  getCurrentUser(): IUserIdentity | null {
    return RequestContext.currentIdentity() ?? this.fallbackUser;
  }

  isAuthenticated(): boolean {
    return this.getCurrentUser() !== null;
  }
}
