-- Align Trainer operational permissions with Receptionist operational permissions
-- Business justification: Prompt 84303 - Small team model where Trainers also perform front-desk and reception responsibilities
-- Guarantee: RECEPTIONIST operational permissions ⊆ TRAINER operational permissions
-- Safe, additive, idempotent data migration preserving all existing accounts, roles, and custom assignments.

INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at", "updated_at")
SELECT 
    gen_random_uuid()::text,
    r.id,
    p.id,
    NOW(),
    NOW()
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.name = 'Trainer'
  AND p.code IN (
    'appointments.delete',
    'billing.read',
    'billing.write',
    'inventory.read',
    'sales.create',
    'sales.cancel',
    'payments.read',
    'payments.create',
    'payments.manage',
    'receipts.manage'
  )
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

