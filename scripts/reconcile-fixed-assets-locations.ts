import { PrismaClient, Prisma } from '@prisma/client';

/**
 * Auditable Reconciliation Script for Fixed Asset Locations & Tenant Ownership
 *
 * Problem:
 * 1. Early demonstration fixtures persisted fixed asset locations with legacy keys
 *    ({ "facility": "Main Facility", "room": "..." }) instead of the authoritative
 *    domain schema ({ "facilityId": "fac-main", "roomId": "...", "zone": "...", "description": "..." }).
 * 2. Unassigned assets with tenant_id IS NULL bypassed tenant-scoped queries.
 *
 * Invariants:
 * - Reconcile facility and room coordinates to valid domain identifiers.
 * - Ensure tenant ownership is bound to 'tenant-kinergy-main'.
 * - Preserve immutable audit trail and log every reconciled asset.
 */
async function main() {
  const prisma = new PrismaClient();
  const defaultTenantId = process.env.DEFAULT_TENANT_ID || 'tenant-kinergy-main';

  console.log('================================================================');
  console.log('AUDITABLE RECONCILIATION: FIXED ASSET LOCATIONS & TENANT BINDING');
  console.log(`Target Default Tenant: ${defaultTenantId}`);
  console.log('================================================================\n');

  try {
    const assets = await prisma.fixedAsset.findMany();
    console.log(`Auditing ${assets.length} fixed asset records...`);

    let reconciledCount = 0;

    for (const asset of assets) {
      const rawLoc =
        asset.location && typeof asset.location === 'object' && !Array.isArray(asset.location)
          ? (asset.location as Record<string, unknown>)
          : {};

      const currentFacilityId =
        typeof rawLoc.facilityId === 'string' && rawLoc.facilityId.trim().length > 0
          ? rawLoc.facilityId.trim()
          : typeof rawLoc.facility === 'string' && rawLoc.facility.trim().length > 0
            ? rawLoc.facility === 'Main Facility'
              ? 'fac-main'
              : rawLoc.facility.trim()
            : 'fac-main';

      const currentRoomId =
        typeof rawLoc.roomId === 'string' && rawLoc.roomId.trim().length > 0
          ? rawLoc.roomId.trim()
          : typeof rawLoc.room === 'string' && rawLoc.room.trim().length > 0
            ? rawLoc.room.includes('Room 1')
              ? 'room-seed-kinesio-01'
              : 'studio-b-facility'
            : undefined;

      const currentZone =
        typeof rawLoc.zone === 'string' && rawLoc.zone.trim().length > 0
          ? rawLoc.zone.trim()
          : typeof rawLoc.room === 'string'
            ? rawLoc.room.trim()
            : undefined;

      const currentDesc =
        typeof rawLoc.description === 'string' && rawLoc.description.trim().length > 0
          ? rawLoc.description.trim()
          : asset.name;

      const normalizedLocation = {
        facilityId: currentFacilityId,
        ...(currentRoomId && { roomId: currentRoomId }),
        ...(currentZone && { zone: currentZone }),
        ...(currentDesc && { description: currentDesc }),
      };

      const needsTenantUpdate = !asset.tenantId || asset.tenantId.trim().length === 0;
      const needsLocationUpdate =
        !rawLoc.facilityId ||
        typeof rawLoc.facilityId !== 'string' ||
        rawLoc.facilityId !== currentFacilityId;

      if (needsTenantUpdate || needsLocationUpdate) {
        console.log(`- Reconciling asset '${asset.name}' (${asset.id}):`);
        if (needsTenantUpdate) {
          console.log(`    Tenant: ${asset.tenantId ?? 'NULL'} -> ${defaultTenantId}`);
        }
        if (needsLocationUpdate) {
          console.log(
            `    Location: ${JSON.stringify(rawLoc)} -> ${JSON.stringify(normalizedLocation)}`,
          );
        }

        await prisma.fixedAsset.update({
          where: { id: asset.id },
          data: {
            tenantId: asset.tenantId ?? defaultTenantId,
            location: normalizedLocation as Prisma.InputJsonValue,
          },
        });

        reconciledCount++;
      }
    }

    console.log(`\nReconciliation completed. ${reconciledCount} asset(s) updated.`);
  } catch (error) {
    console.error('Reconciliation failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
