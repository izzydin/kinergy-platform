import {
  JwtTestFactory,
  SecurityContextTestMock,
  HttpRequestBuilder,
  ResultAssertions,
  EntityAssertions,
  UserTestFactory,
  RoleTestFactory,
  adminUserFixture,
  activeUserFixture,
  MockClock,
  MockLogger,
  MockSecurityEventPublisher,
  RandomTestData,
  RepositoryMockFactory,
  customTestMatchers,
  DatabaseSeedHelper,
  MockDatabaseTestCleaner,
} from '../index';

describe('@kinergy-platform/testing Platform Package', () => {
  describe('Auth Test Helpers', () => {
    it('should generate valid mock JWT claims and token strings', () => {
      const claims = JwtTestFactory.createClaims({
        sub: 'usr_custom_1',
        roles: ['ADMIN'],
      });

      expect(claims.sub).toBe('usr_custom_1');
      expect(claims.roles).toEqual(['ADMIN']);

      const token = JwtTestFactory.createMockToken(claims);
      expect(token).toBeDefined();
      expect(token.split('.')).toHaveLength(3);
    });

    it('should create authenticated request mock with authorization headers', () => {
      const req = SecurityContextTestMock.createAuthenticatedRequest({
        sub: 'usr_req_1',
      });

      expect(req.user.userId).toBe('usr_req_1');
      expect(req.headers.authorization).toContain('Bearer ');
    });
  });

  describe('HTTP Request Builder', () => {
    it('should fluently build HTTP request descriptors', () => {
      const req = new HttpRequestBuilder()
        .post('/auth/login')
        .withHeader('x-tenant-id', 'tenant_1')
        .withBearerToken('token_abc')
        .withQuery('ref', 'email')
        .withBody({ email: 'user@example.com' })
        .build();

      expect(req.method).toBe('POST');
      expect(req.url).toBe('/auth/login');
      expect(req.headers['x-tenant-id']).toBe('tenant_1');
      expect(req.headers['authorization']).toBe('Bearer token_abc');
      expect(req.query['ref']).toBe('email');
      expect(req.body).toEqual({ email: 'user@example.com' });
    });
  });

  describe('Assertions & Helpers', () => {
    it('should correctly assert Result OK and Fail', () => {
      const okResult = { isSuccess: true, value: 'data' };
      const failResult = { isSuccess: false, error: 'err_msg' };

      expect(ResultAssertions.expectOk(okResult)).toBe('data');
      expect(ResultAssertions.expectFail(failResult)).toBe('err_msg');
    });

    it('should compare entity IDs', () => {
      const entityA = { id: 'ent_1' };
      const entityB = { id: 'ent_1' };
      expect(() => EntityAssertions.expectEqualId(entityA, entityB)).not.toThrow();
    });

    it('should generate Jest mock repository', () => {
      const mockRepo = RepositoryMockFactory.createMockRepository();
      expect(mockRepo.findById).toBeDefined();
      expect(mockRepo.save).toBeDefined();
    });
  });

  describe('Factories & Fixtures', () => {
    it('should produce test entities with incrementing sequence IDs', () => {
      const userFactory = new UserTestFactory();
      const user1 = userFactory.create();
      const user2 = userFactory.create();

      expect(user1.id).not.toEqual(user2.id);
      expect(user1.status).toBe('ACTIVE');

      const roleFactory = new RoleTestFactory();
      const role1 = roleFactory.create({ name: 'CUSTOM_ROLE' });
      expect(role1.name).toBe('CUSTOM_ROLE');
    });

    it('should expose static user fixtures', () => {
      expect(adminUserFixture.roles).toContain('SUPER_ADMIN');
      expect(activeUserFixture.status).toBe('ACTIVE');
    });
  });

  describe('Mocks', () => {
    it('should track time in MockClock', () => {
      const clock = new MockClock(new Date('2026-01-01T00:00:00.000Z'));
      expect(clock.now().toISOString()).toBe('2026-01-01T00:00:00.000Z');

      clock.advanceSeconds(60);
      expect(clock.now().toISOString()).toBe('2026-01-01T00:01:00.000Z');
    });

    it('should record log statements silently in MockLogger', () => {
      const logger = new MockLogger();
      logger.log('Test message', 'TestContext');

      expect(logger.logs).toHaveLength(1);
      expect(logger.hasLog('Test message')).toBe(true);
    });

    it('should capture security events in MockSecurityEventPublisher', async () => {
      const publisher = new MockSecurityEventPublisher();
      await publisher.publish({
        eventId: 'evt_1',
        eventType: 'LoginSucceeded',
        timestamp: new Date(),
        userId: 'usr_1',
      });

      expect(publisher.hasPublishedEvent('LoginSucceeded', 'usr_1')).toBe(true);
    });
  });

  describe('Custom Matchers & Utilities', () => {
    it('should validate UUIDs with custom matcher', () => {
      const validUuid = RandomTestData.uuid();
      const matcherResult = customTestMatchers.toBeValidUuid(validUuid);
      expect(matcherResult.pass).toBe(true);
    });

    it('should provide database seed roles and mock cleaner', async () => {
      const roles = DatabaseSeedHelper.getStandardRoles();
      expect(roles).toHaveLength(3);

      const cleaner = new MockDatabaseTestCleaner();
      await cleaner.cleanAll();
      expect(cleaner.cleanedTables).toContain('*');
    });
  });
});
