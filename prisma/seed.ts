import { PrismaClient } from '@prisma/client';
import { seedIdentity } from './seeds/identity.seed';

const prisma = new PrismaClient();

/**
 * Main Database Seed Orchestrator
 * Designed to execute modular seed scripts idempotently across bounded contexts.
 */
async function main(): Promise<void> {
  console.log('🌱 Starting Kinergy Platform Database Seeding Pipeline...\n');

  const startTime = Date.now();

  // 1. Execute Identity Bounded Context Seed
  const identitySummary = await seedIdentity(prisma);

  const duration = Date.now() - startTime;

  console.log('\n✅ Database Seeding Completed Successfully!');
  console.log('================================================');
  console.log(`- Permissions Seeded:      ${identitySummary.permissionsCount}`);
  console.log(`- Roles Seeded:            ${identitySummary.rolesCount}`);
  console.log(`- Role-Permissions Seeded: ${identitySummary.rolePermissionsCount}`);
  console.log(`- Bootstrap Owner Account: ${identitySummary.ownerEmail}`);
  console.log(`- Total Execution Time:    ${duration}ms`);
  console.log('================================================\n');
}

main()
  .catch((error: unknown) => {
    console.error('❌ Database Seeding Pipeline Failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
