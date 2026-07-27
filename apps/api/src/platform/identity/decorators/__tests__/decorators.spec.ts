import { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, Public } from '../public.decorator';
import { ROLES_KEY, Roles } from '../roles.decorator';
import { PERMISSIONS_KEY, Permissions } from '../permissions.decorator';
import { CurrentUser, AuthenticatedUserPayload } from '../current-user.decorator';

describe('Security Decorators', () => {
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
  });

  describe('@Public()', () => {
    it('should attach isPublic metadata to controller handler', () => {
      class TestController {
        @Public()
        testEndpoint() {}
      }

      const instance = new TestController();
      const metadata = reflector.get<boolean>(IS_PUBLIC_KEY, instance.testEndpoint);

      expect(metadata).toBe(true);
    });
  });

  describe('@Roles()', () => {
    it('should attach roles metadata array to controller handler', () => {
      class TestController {
        @Roles('ADMIN', 'MANAGER')
        testEndpoint() {}
      }

      const instance = new TestController();
      const metadata = reflector.get<string[]>(ROLES_KEY, instance.testEndpoint);

      expect(metadata).toEqual(['ADMIN', 'MANAGER']);
    });
  });

  describe('@Permissions()', () => {
    it('should attach permissions metadata array to controller handler', () => {
      class TestController {
        @Permissions('read:users', 'write:users')
        testEndpoint() {}
      }

      const instance = new TestController();
      const metadata = reflector.get<string[]>(PERMISSIONS_KEY, instance.testEndpoint);

      expect(metadata).toEqual(['read:users', 'write:users']);
    });
  });

  describe('@CurrentUser()', () => {
    const mockUserPayload: AuthenticatedUserPayload = {
      id: 'usr_123',
      email: 'user@example.com',
      status: 'ACTIVE',
      roles: ['USER'],
      permissions: ['read:profile'],
      tenantId: 'tenant_abc',
    };

    const getParamDecoratorFactory = (_decorator: unknown) => {
      class TestTarget {
        public testMethod(@CurrentUser() _user: unknown) {}
      }

      const metadata = Reflect.getMetadata(ROUTE_ARGS_METADATA, TestTarget, 'testMethod');
      const keys = Object.keys(metadata);
      const key = keys[0];
      return key ? metadata[key].factory : null;
    };

    const createMockContext = (user?: AuthenticatedUserPayload): ExecutionContext => {
      return {
        switchToHttp: () => ({
          getRequest: () => ({ user }),
        }),
      } as unknown as ExecutionContext;
    };

    it('should extract full user payload when no property parameter is provided', () => {
      const factory = getParamDecoratorFactory(CurrentUser);
      const context = createMockContext(mockUserPayload);

      const result = factory(undefined, context);

      expect(result).toEqual(mockUserPayload);
    });

    it('should extract specific user property when key parameter is provided', () => {
      const factory = getParamDecoratorFactory(CurrentUser);
      const context = createMockContext(mockUserPayload);

      const idResult = factory('id', context);
      const emailResult = factory('email', context);
      const tenantResult = factory('tenantId', context);

      expect(idResult).toBe('usr_123');
      expect(emailResult).toBe('user@example.com');
      expect(tenantResult).toBe('tenant_abc');
    });

    it('should return null if no user is present on request context', () => {
      const factory = getParamDecoratorFactory(CurrentUser);
      const context = createMockContext(undefined);

      const result = factory(undefined, context);

      expect(result).toBeNull();
    });
  });
});
