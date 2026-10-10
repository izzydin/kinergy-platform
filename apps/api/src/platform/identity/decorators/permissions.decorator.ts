import { SetMetadata } from '@nestjs/common';
import { PermissionCode } from '../authorization/permissions';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Decorator specifying required granular permissions for accessing an endpoint or controller.
 * Accepts type-safe PermissionCode constants or string identifiers.
 */
export const Permissions = (...permissions: (PermissionCode | string)[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Authoritative alias matching repository architecture and ADR-0026 documentation.
 */
export const RequirePermissions = Permissions;
