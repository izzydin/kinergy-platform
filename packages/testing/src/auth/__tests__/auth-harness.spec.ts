import * as jwt from 'jsonwebtoken';
import {
  auth,
  JwtTestFactory,
  AuthContextBuilder,
  AuthAssertions,
  createOwner,
  createTrainer,
  createReceptionist,
  createKitchenStaff,
  createClientUser,
  DEFAULT_TEST_JWT_SECRET,
  DEFAULT_TEST_ISSUER,
  DEFAULT_TEST_AUDIENCE,
} from '../../index';

describe('Authentication Test Harness', () => {
  describe('Persona Factories', () => {
    it('should generate Owner persona with OWNER & ADMIN roles', () => {
      const owner = createOwner();
      expect(owner.roles).toEqual(['OWNER', 'ADMIN']);
      expect(owner.permissions).toEqual(['*']);
      expect(owner.email).toContain('owner_');
    });

    it('should generate Trainer persona with trainer roles and permissions', () => {
      const trainer = createTrainer();
      expect(trainer.roles).toEqual(['TRAINER']);
      expect(trainer.permissions).toContain('manage:workouts');
    });

    it('should generate Receptionist persona with receptionist permissions', () => {
      const receptionist = createReceptionist();
      expect(receptionist.roles).toEqual(['RECEPTIONIST']);
      expect(receptionist.permissions).toContain('manage:checkin');
    });

    it('should generate Kitchen Staff persona with nutrition permissions', () => {
      const kitchenStaff = createKitchenStaff();
      expect(kitchenStaff.roles).toEqual(['KITCHEN_STAFF']);
      expect(kitchenStaff.permissions).toContain('manage:meals');
    });

    it('should generate Client persona with client permissions', () => {
      const client = createClientUser();
      expect(client.roles).toEqual(['CLIENT']);
      expect(client.permissions).toContain('book:classes');
    });
  });

  describe('JWT Factory - Production Compliance', () => {
    it('should sign JWT tokens verified natively by jsonwebtoken', () => {
      const owner = createOwner();
      const token = JwtTestFactory.createSignedToken(owner);

      const decoded = jwt.verify(token, DEFAULT_TEST_JWT_SECRET, {
        issuer: DEFAULT_TEST_ISSUER,
        audience: DEFAULT_TEST_AUDIENCE,
      }) as jwt.JwtPayload;

      expect(decoded.sub).toBe(owner.id);
      expect(decoded['email']).toBe(owner.email);
      expect(decoded['roles']).toEqual(['OWNER', 'ADMIN']);
    });

    it('should sign expired JWT tokens for security tests', () => {
      const token = JwtTestFactory.createExpiredToken();
      expect(() =>
        jwt.verify(token, DEFAULT_TEST_JWT_SECRET, {
          issuer: DEFAULT_TEST_ISSUER,
          audience: DEFAULT_TEST_AUDIENCE,
        }),
      ).toThrow(jwt.TokenExpiredError);
    });
  });

  describe('Authenticated Request Builder & auth() helper', () => {
    it('should construct request descriptor using auth(owner)', () => {
      const owner = createOwner();
      const req = auth(owner).get('/clients').withQuery('page', '1').build();

      expect(req.method).toBe('GET');
      expect(req.url).toBe('/clients');
      expect(req.headers['authorization']).toContain('Bearer ');
      expect(req.headers['x-tenant-id']).toBe(owner.tenantId);
      expect(req.query['page']).toBe('1');
    });

    it('should construct request using auth(trainer) shorthand', () => {
      const trainer = createTrainer();
      const headers = auth(trainer).headers();
      expect(headers['authorization']).toContain('Bearer ');
    });
  });

  describe('AuthContextBuilder', () => {
    it('should fluently assemble security claims and sign tokens', () => {
      const builder = new AuthContextBuilder()
        .withUser('usr_ctx_1', 'custom@kinergy.local')
        .withRoles('SUPER_ADMIN')
        .withPermissions('all')
        .withTenant('tenant_ent');

      const claims = builder.buildClaims();
      expect(claims.sub).toBe('usr_ctx_1');
      expect(claims.roles).toEqual(['SUPER_ADMIN']);

      const token = builder.buildToken();
      expect(token).toBeDefined();
    });
  });

  describe('AuthAssertions', () => {
    it('should assert authenticated responses', () => {
      expect(() => AuthAssertions.expectAuthenticated({ status: 200 })).not.toThrow();
      expect(() => AuthAssertions.expectAuthenticated({ status: 401 })).toThrow();
      expect(() => AuthAssertions.expectAuthenticated({ status: 403 })).toThrow();
    });

    it('should assert unauthorized and forbidden statuses', () => {
      expect(() => AuthAssertions.expectUnauthorized({ status: 401 })).not.toThrow();
      expect(() => AuthAssertions.expectForbidden({ status: 403 })).not.toThrow();
    });
  });
});
