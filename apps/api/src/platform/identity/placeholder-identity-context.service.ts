import { Injectable } from '@nestjs/common';
import { IIdentityContext } from './identity-context.interface';
import { IUserIdentity } from './user-identity.interface';

@Injectable()
export class PlaceholderIdentityContextService implements IIdentityContext {
  private readonly defaultUser: IUserIdentity = {
    userId: 'system-placeholder-user-id',
    email: 'system@kinergy-platform.local',
    roles: ['SYSTEM_ADMIN'],
  };

  getCurrentUser(): IUserIdentity | null {
    return this.defaultUser;
  }

  isAuthenticated(): boolean {
    return true;
  }
}
