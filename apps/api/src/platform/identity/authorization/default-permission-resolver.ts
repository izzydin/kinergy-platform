import { Injectable } from '@nestjs/common';
import { IPermissionResolver } from './authorization.interface';
import { getRolePermissions } from './permissions';

/**
 * Default implementation of IPermissionResolver.
 * Consolidates user permissions from static system role definitions and direct assignments.
 * Extensible for future dynamic role mappings, tenant-specific permissions, or database lookups.
 */
@Injectable()
export class DefaultPermissionResolver implements IPermissionResolver {
  async resolvePermissions(
    _userId: string,
    userRoles: string[] = [],
    directPermissions: string[] = [],
    _tenantId?: string | null,
  ): Promise<string[]> {
    const rolePermissions = (userRoles ?? []).flatMap((role) => getRolePermissions(role));
    const consolidated = [...rolePermissions, ...(directPermissions ?? [])];
    return Array.from(new Set(consolidated));
  }
}
