import { ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { TrustedAi } from '../decorators/trusted-ai-context.decorator';
import { AuthenticatedUserPayload } from '../../../platform/identity/decorators/current-user.decorator';

// Helper to extract decorator factory function
function getParamDecoratorFactory(
  decorator: (...args: unknown[]) => ParameterDecorator,
): (data: unknown, ctx: ExecutionContext) => unknown {
  class TestClass {
    public testMethod(@decorator() _param: unknown) {}
  }
  // Parameter decorators store metadata or can be called directly
  // In NestJS, createParamDecorator returns a function with an internal factory.
  // We can invoke the decorator's underlying metadata or simulate execution context.
  const metadata = Reflect.getMetadata('__routeArguments__', TestClass, 'testMethod');
  const key = Object.keys(metadata ?? {})[0];
  if (key && metadata[key]?.factory) {
    return metadata[key].factory;
  }
  return decorator as unknown as (data: unknown, ctx: ExecutionContext) => unknown;
}

describe('AI-09.3-BE.05.01 — TrustedAi Context Decorator Verification', () => {
  const factory = getParamDecoratorFactory(TrustedAi);

  const createMockContext = (user?: Partial<AuthenticatedUserPayload> | null): ExecutionContext => {
    const request = {
      user: user === undefined ? undefined : user,
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  };

  it('1. extracts trusted actorId, tenantId, roles, and permissions from request.user', () => {
    const mockUser: AuthenticatedUserPayload = {
      id: 'usr_doc_99',
      email: 'doctor@kinergy.com',
      status: 'ACTIVE',
      roles: ['Doctor', 'Staff'],
      permissions: ['ai.conversations.audit', 'clients.read'],
      tenantId: 'tenant_kinergy_primary',
    };

    const ctx = createMockContext(mockUser);
    const result = factory(undefined, ctx) as Record<string, unknown>;

    expect(result).toEqual({
      actorId: 'usr_doc_99',
      tenantId: 'tenant_kinergy_primary',
      email: 'doctor@kinergy.com',
      roles: ['Doctor', 'Staff'],
      permissions: ['ai.conversations.audit', 'clients.read'],
    });
  });

  it('2. throws UnauthorizedException when user identity is completely missing', () => {
    const ctx = createMockContext(null);

    expect(() => factory(undefined, ctx)).toThrow(UnauthorizedException);
  });

  it('3. throws UnauthorizedException when actorId is empty or whitespace', () => {
    const ctx = createMockContext({
      id: '   ',
      tenantId: 'tenant_valid',
    });

    expect(() => factory(undefined, ctx)).toThrow(UnauthorizedException);
  });

  it('4. throws ForbiddenException when tenantId is null or missing from authenticated principal', () => {
    const ctx = createMockContext({
      id: 'usr_no_tenant',
      tenantId: null,
    });

    expect(() => factory(undefined, ctx)).toThrow(ForbiddenException);
  });

  it('5. trims whitespace from actorId and tenantId to guarantee clean scoping', () => {
    const ctx = createMockContext({
      id: '  usr_with_spaces  ',
      tenantId: '  tenant_with_spaces  ',
    });

    const result = factory(undefined, ctx) as Record<string, unknown>;

    expect(result['actorId']).toBe('usr_with_spaces');
    expect(result['tenantId']).toBe('tenant_with_spaces');
  });
});
