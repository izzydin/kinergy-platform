import { PrismaClient } from '@prisma/client';
import { seedIdentity } from './seeds/identity.seed';
import { assertSafeDemoEnvironment, seedDemoFixtures } from './seeds/demo-fixtures.seed';
import { seedSales } from './seeds/sales.seed';

const prisma = new PrismaClient();

/**
 * Main Database Seed Orchestrator
 * Designed to execute modular seed scripts idempotently across bounded contexts.
 */
async function main(): Promise<void> {
  console.log('🌱 Starting Kinergy Platform Database Seeding Pipeline...\n');

  const startTime = Date.now();

  // 0. Safety Environment Check
  assertSafeDemoEnvironment();

  // 1. Execute Identity Bounded Context Seed (Roles, Permissions, Owner)
  const identitySummary = await seedIdentity(prisma);

  // 2. Execute Deterministic Synthetic Demo Fixtures (Milestone 9.5.3)
  const demoSummary = await seedDemoFixtures(prisma);

  // 3. Execute Sales & Financial Bounded Context Seed (Phase 7)
  const salesSummary = await seedSales(prisma);

  const duration = Date.now() - startTime;

  console.log('\n✅ Database Seeding Completed Successfully!');
  console.log('================================================');
  console.log(`- Permissions Seeded:      ${identitySummary.permissionsCount}`);
  console.log(`- Roles Seeded:            ${identitySummary.rolesCount}`);
  console.log(`- Role-Permissions Seeded: ${identitySummary.rolePermissionsCount}`);
  console.log(`- Bootstrap Owner Account: ${identitySummary.ownerEmail}`);
  console.log(`- Demo Staff Accounts:     ${demoSummary.usersCount}`);
  console.log(`- Rooms Seeded:            ${demoSummary.roomsCount}`);
  console.log(`- Demo Clients Seeded:     ${demoSummary.clientsCount}`);
  console.log(`- Membership Plans Seeded: ${demoSummary.plansCount}`);
  console.log(`- Active Memberships:      ${demoSummary.membershipsCount}`);
  console.log(`- Check-In Records:        ${demoSummary.attendanceCount}`);
  console.log(`- Appointments Seeded:     ${demoSummary.appointmentsCount}`);
  console.log(`- Clinical SOAP Sessions:  ${demoSummary.treatmentSessionsCount}`);
  console.log(`- Inventory Items Seeded:  ${demoSummary.inventoryItemsCount}`);
  console.log(`- Stock Movement Entries:  ${demoSummary.stockMovementsCount}`);
  console.log(`- Fixed Assets Seeded:     ${demoSummary.fixedAssetsCount}`);
  console.log(`- Sales Orders Seeded:     ${salesSummary.salesCount}`);
  console.log(`- Sale Items Seeded:       ${salesSummary.saleItemsCount}`);
  console.log(`- Payments Seeded:         ${salesSummary.paymentsCount}`);
  console.log(`- Receipts Seeded:         ${salesSummary.receiptsCount}`);
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
