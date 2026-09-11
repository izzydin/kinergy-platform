import { User, UserStatus, IUserRepository } from '../../../platform/identity/domain';
import { JwtTestFactory } from '@kinergy-platform/testing';

export interface TestPersona {
  readonly userId: string;
  readonly email: string;
  readonly roles: string[];
  readonly permissions: string[];
  readonly tenantId: string;
  readonly token: string;
}

export const TEST_TENANT_ID = 'tenant_e2e_wellness';

export function createTestOwner(tenantId = TEST_TENANT_ID): TestPersona {
  const userId = 'usr_owner_e2e';
  const email = 'owner@wellness.e2e.test';
  const roles = ['OWNER', 'ADMIN'];
  const permissions = [
    '*',
    'inventory.read',
    'inventory.write',
    'assets.read',
    'assets.write',
    'billing.read',
  ];

  const token = JwtTestFactory.createSignedToken({
    sub: userId,
    email,
    roles,
    permissions,
    tenantId,
    tokenVersion: 1,
  });

  return { userId, email, roles, permissions, tenantId, token };
}

export function createTestReceptionist(tenantId = TEST_TENANT_ID): TestPersona {
  const userId = 'usr_receptionist_e2e';
  const email = 'receptionist@wellness.e2e.test';
  const roles = ['RECEPTIONIST'];
  const permissions = ['inventory.read', 'inventory.write'];

  const token = JwtTestFactory.createSignedToken({
    sub: userId,
    email,
    roles,
    permissions,
    tenantId,
    tokenVersion: 1,
  });

  return { userId, email, roles, permissions, tenantId, token };
}

export function createTestTrainer(tenantId = TEST_TENANT_ID): TestPersona {
  const userId = 'usr_trainer_e2e';
  const email = 'trainer@wellness.e2e.test';
  const roles = ['TRAINER'];
  const permissions = ['inventory.read', 'inventory.write'];

  const token = JwtTestFactory.createSignedToken({
    sub: userId,
    email,
    roles,
    permissions,
    tenantId,
    tokenVersion: 1,
  });

  return { userId, email, roles, permissions, tenantId, token };
}

export function createTestClient(tenantId = TEST_TENANT_ID): TestPersona {
  const userId = 'usr_client_e2e';
  const email = 'client@wellness.e2e.test';
  const roles = ['CLIENT'];
  const permissions = ['read:own'];

  const token = JwtTestFactory.createSignedToken({
    sub: userId,
    email,
    roles,
    permissions,
    tenantId,
    tokenVersion: 1,
  });

  return { userId, email, roles, permissions, tenantId, token };
}

export class InMemoryE2EUserRepository implements IUserRepository {
  private readonly users = new Map<string, User>();

  public reset(): void {
    this.users.clear();
  }

  public async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  public async findByEmail(email: string): Promise<User | null> {
    const normalized = email.toLowerCase().trim();
    for (const u of this.users.values()) {
      if (u.email.toLowerCase().trim() === normalized) {
        return u;
      }
    }
    return null;
  }

  public async create(user: User): Promise<void> {
    this.users.set(user.id, user);
  }

  public async save(user: User): Promise<void> {
    this.users.set(user.id, user);
  }

  public async search(): Promise<{ items: User[]; total: number; page: number; limit: number }> {
    const items = Array.from(this.users.values());
    return { items, total: items.length, page: 1, limit: items.length };
  }

  public async updateRefreshToken(): Promise<void> {}
}

export async function seedAuthPersonas(
  userRepo: IUserRepository,
  personas: TestPersona[],
): Promise<void> {
  for (const p of personas) {
    const user = new User({
      id: p.userId,
      email: p.email,
      passwordHash: 'dummy_argon2_hash',
      status: UserStatus.ACTIVE,
      roles: p.roles,
      permissions: p.permissions,
      tenantId: p.tenantId,
      tokenVersion: 1,
    });
    await userRepo.save(user);
  }
}
