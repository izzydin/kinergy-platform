import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Decorator specifying required user roles for accessing an endpoint or controller.
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
