import { TestFactoryBase } from './test-factory.base';

export interface UserTestFactoryProps {
  id: string;
  email: string;
  passwordHash: string;
  status: string;
  roles: string[];
  permissions: string[];
  tenantId?: string | null;
  hashedRefreshToken?: string | null;
  refreshTokenExpiresAt?: Date | null;
  tokenVersion?: number;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null;
}

export class UserTestFactory extends TestFactoryBase<UserTestFactoryProps, UserTestFactoryProps> {
  protected getDefaultProps(): UserTestFactoryProps {
    const seq = this.sequenceCounter;
    return {
      id: `usr_test_${seq}`,
      email: `testuser_${seq}@example.com`,
      passwordHash: `$argon2id$v=19$m=65536,t=3,p=4$dummy_salt_${seq}$dummy_hash_${seq}`,
      status: 'ACTIVE',
      roles: ['USER'],
      permissions: [],
      tenantId: 'tenant_test_1',
      hashedRefreshToken: null,
      refreshTokenExpiresAt: null,
      tokenVersion: 1,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      deletedAt: null,
    };
  }

  protected buildEntity(props: UserTestFactoryProps): UserTestFactoryProps {
    return props;
  }
}
