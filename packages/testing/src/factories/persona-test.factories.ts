import { UserTestFactory, UserTestFactoryProps } from './user-test.factory';

const baseUserFactory = new UserTestFactory();

export class OwnerTestFactory {
  public static create(overrides?: Partial<UserTestFactoryProps>): UserTestFactoryProps {
    return baseUserFactory.create({
      roles: ['OWNER', 'ADMIN'],
      permissions: ['*'],
      email: `owner_${Date.now()}@kinergy.local`,
      ...overrides,
    });
  }
}

export class TrainerTestFactory {
  public static create(overrides?: Partial<UserTestFactoryProps>): UserTestFactoryProps {
    return baseUserFactory.create({
      roles: ['TRAINER'],
      permissions: ['read:clients', 'manage:workouts', 'manage:schedules'],
      email: `trainer_${Date.now()}@kinergy.local`,
      ...overrides,
    });
  }
}

export class ReceptionistTestFactory {
  public static create(overrides?: Partial<UserTestFactoryProps>): UserTestFactoryProps {
    return baseUserFactory.create({
      roles: ['RECEPTIONIST'],
      permissions: ['read:clients', 'manage:schedules', 'manage:checkin'],
      email: `receptionist_${Date.now()}@kinergy.local`,
      ...overrides,
    });
  }
}

export class KitchenStaffTestFactory {
  public static create(overrides?: Partial<UserTestFactoryProps>): UserTestFactoryProps {
    return baseUserFactory.create({
      roles: ['KITCHEN_STAFF'],
      permissions: ['read:nutrition', 'manage:meals', 'manage:orders'],
      email: `kitchen_${Date.now()}@kinergy.local`,
      ...overrides,
    });
  }
}

export class ClientTestFactory {
  public static create(overrides?: Partial<UserTestFactoryProps>): UserTestFactoryProps {
    return baseUserFactory.create({
      roles: ['CLIENT'],
      permissions: ['read:own_profile', 'book:classes', 'view:meal_plan'],
      email: `client_${Date.now()}@kinergy.local`,
      ...overrides,
    });
  }
}

/**
 * Shorthand persona creation functions.
 */
export function createOwner(overrides?: Partial<UserTestFactoryProps>): UserTestFactoryProps {
  return OwnerTestFactory.create(overrides);
}

export function createTrainer(overrides?: Partial<UserTestFactoryProps>): UserTestFactoryProps {
  return TrainerTestFactory.create(overrides);
}

export function createReceptionist(
  overrides?: Partial<UserTestFactoryProps>,
): UserTestFactoryProps {
  return ReceptionistTestFactory.create(overrides);
}

export function createKitchenStaff(
  overrides?: Partial<UserTestFactoryProps>,
): UserTestFactoryProps {
  return KitchenStaffTestFactory.create(overrides);
}

export function createClientUser(overrides?: Partial<UserTestFactoryProps>): UserTestFactoryProps {
  return ClientTestFactory.create(overrides);
}
