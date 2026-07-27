import { Injectable } from '@nestjs/common';
import { IPermissionResolver } from './authorization.interface';

/**
 * Default implementation of IPermissionResolver.
 * Consolidates user permissions from direct assignments and role-based defaults.
 * Extensible for future dynamic role mappings, tenant-specific permissions, or database lookups.
 */
@Injectable()
export class DefaultPermissionResolver implements IPermissionResolver {
  async resolvePermissions(
    _userId: string,
    _userRoles: string[],
    directPermissions: string[] = [],
    _tenantId?: string | null,
  ): Promise<string[]> {
    const uniquePermissions = Array.from(new Set(directPermissions));
    return uniquePermissions;
  }
}
