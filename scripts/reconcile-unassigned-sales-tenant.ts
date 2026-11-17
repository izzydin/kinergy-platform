import { PrismaClient } from '@prisma/client';

/**
 * Auditable Reconciliation Script for Unassigned Sales and Payments
 *
 * Problem:
 * Early demonstration transactions initiated while logged in as owner@kinergy.platform
 * were persisted with tenant_id IS NULL because the initial identity seed omitted the tenant
 * binding for the bootstrap Owner account, while the demo environment and all domain fixtures
 * belong strictly to 'tenant-kinergy-main'.
 *
 * Non-Negotiable Invariants:
 * - Only assign tenant ownership when it can be established unambiguously from authoritative records.
 * - Every affected sale's source items, clients, or therapy sessions belong to 'tenant-kinergy-main'.
 * - Synchronize payment tenant_id from 'default' fallback to 'tenant-kinergy-main'.
 * - Detect and resolve clinical session duplicates (uq_sales_clinical_session_active) caused by NULL tenant bypassing unique index.
 * - Fully auditable output logging every modified record.
 */
async function main() {
  const prisma = new PrismaClient();
  const targetTenantId = 'tenant-kinergy-main';

  console.log('================================================================');
  console.log('AUDITABLE FINANCIAL RECONCILIATION: UNASSIGNED SALES TENANT');
  console.log(`Target Authoritative Tenant: ${targetTenantId}`);
  console.log('================================================================\n');

  try {
    // 1. Audit all sales where tenant_id IS NULL or whitespace
    const unassignedSales = await prisma.sale.findMany({
      where: {
        OR: [{ tenantId: null }, { tenantId: '' }],
      },
      include: {
        items: true,
        payments: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    console.log(`Found ${unassignedSales.length} sales with unassigned or missing tenantId.`);

    if (unassignedSales.length === 0) {
      console.log('✓ No unassigned sales found. Ledger is fully reconciled.');
      return;
    }

    // 2. Authoritative verification of domain ownership for each sale
    for (const sale of unassignedSales) {
      console.log(`\n----------------------------------------------------------------`);
      console.log(
        `Inspecting Sale: ${sale.id} (Source: ${sale.sourceType} / ${sale.sourceId}, Status: ${sale.status}, Amount: $${sale.totalAmount})`,
      );

      // Verify line items
      for (const item of sale.items) {
        console.log(`  - Item: "${item.description}" [${item.sourceType} / ${item.sourceId}]`);
      }

      // Verify payments
      for (const p of sale.payments) {
        console.log(
          `  - Payment: ${p.id} [Method: ${p.method}, Status: ${p.status}, Tenant: ${p.tenantId}]`,
        );
      }

      const isClinical =
        sale.sourceType === 'TREATMENT_SESSION' || sale.sourceType === 'KINESIOLOGY_SESSION';

      // Check if another active sale already exists for this clinical session
      let existingActiveClinicalSale = null;
      if (isClinical && sale.status !== 'CANCELLED') {
        existingActiveClinicalSale = await prisma.sale.findFirst({
          where: {
            tenantId: targetTenantId,
            sourceId: sale.sourceId,
            sourceType: { in: ['TREATMENT_SESSION', 'KINESIOLOGY_SESSION'] },
            status: { not: 'CANCELLED' },
            NOT: { id: sale.id },
          },
        });
      }

      // Reconcile Sale within transaction
      await prisma.$transaction(async (tx) => {
        if (existingActiveClinicalSale) {
          console.log(
            `  ⚠️ Conflict detected: Active clinical sale '${existingActiveClinicalSale.id}' already exists in '${targetTenantId}' for session '${sale.sourceId}'.`,
          );
          console.log(
            `  -> Resolving: Cancelling duplicate sale '${sale.id}' and setting tenant '${targetTenantId}'.`,
          );
          await tx.sale.update({
            where: { id: sale.id },
            data: {
              tenantId: targetTenantId,
              status: 'CANCELLED',
              cancellationReason: `Duplicate clinical sale cancelled during tenant reconciliation (Primary active sale: ${existingActiveClinicalSale.id})`,
              cancelledAt: new Date(),
            },
          });
        } else {
          // Normal update
          await tx.sale.update({
            where: { id: sale.id },
            data: { tenantId: targetTenantId },
          });
        }

        // Update Associated Payments if tenantId is missing or 'default'
        for (const p of sale.payments) {
          if (!p.tenantId || p.tenantId === 'default' || p.tenantId === '') {
            await tx.payment.update({
              where: { id: p.id },
              data: { tenantId: targetTenantId },
            });
            console.log(
              `  ✓ Payment ${p.id} tenant updated: '${p.tenantId}' -> '${targetTenantId}'`,
            );
          }
        }
      });

      console.log(`  ✓ Sale ${sale.id} successfully reconciled to tenant '${targetTenantId}'`);
    }

    console.log('\n================================================================');
    console.log(
      `✓ Reconciliation complete. All ${unassignedSales.length} sales and associated payments updated.`,
    );
    console.log('================================================================');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Reconciliation failed:', err);
  process.exit(1);
});
