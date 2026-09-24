import { InMemoryReceiptSequenceGenerator } from '../in-memory-receipt-sequence.generator';
import { ReceiptDomainException } from '../../../domain/exceptions/receipt-domain.exception';
import { ReceiptNumber } from '../../../domain/value-objects/receipt-number.vo';

describe('Receipt Sequence Generator & Concurrency Invariants', () => {
  let generator: InMemoryReceiptSequenceGenerator;

  beforeEach(() => {
    generator = new InMemoryReceiptSequenceGenerator();
  });

  describe('Single-Threaded Deterministic Progression', () => {
    it('generates strictly monotonic, zero-padded gap-free sequences', async () => {
      const tenantId = 'tenant_kinergy_main';
      const year = 2026;

      const n1 = await generator.getNextReceiptNumber(tenantId, year);
      const n2 = await generator.getNextReceiptNumber(tenantId, year);
      const n3 = await generator.getNextReceiptNumber(tenantId, year);

      expect(n1.value).toBe('REC-2026-000001');
      expect(n2.value).toBe('REC-2026-000002');
      expect(n3.value).toBe('REC-2026-000003');

      expect(generator.getCounterValue(tenantId, year)).toBe(3);
    });

    it('resets sequence to 1 across calendar years for the same tenant', async () => {
      const tenantId = 'tenant_annual';

      const y2025_1 = await generator.getNextReceiptNumber(tenantId, 2025);
      const y2025_2 = await generator.getNextReceiptNumber(tenantId, 2025);
      const y2026_1 = await generator.getNextReceiptNumber(tenantId, 2026);
      const y2026_2 = await generator.getNextReceiptNumber(tenantId, 2026);

      expect(y2025_1.value).toBe('REC-2025-000001');
      expect(y2025_2.value).toBe('REC-2025-000002');
      expect(y2026_1.value).toBe('REC-2026-000001');
      expect(y2026_2.value).toBe('REC-2026-000002');
    });

    it('rejects invalid tenant ID or out-of-range calendar year', async () => {
      await expect(generator.getNextReceiptNumber('', 2026)).rejects.toThrow(
        ReceiptDomainException,
      );
      await expect(generator.getNextReceiptNumber('   ', 2026)).rejects.toThrow(
        ReceiptDomainException,
      );
      await expect(generator.getNextReceiptNumber('tenant_1', 1999)).rejects.toThrow(
        ReceiptDomainException,
      );
      await expect(generator.getNextReceiptNumber('tenant_1', 2101)).rejects.toThrow(
        ReceiptDomainException,
      );
    });
  });

  describe('High-Volume Parallel Concurrency Under Single Tenant', () => {
    it('produces 50 strictly unique, gap-free sequence numbers under simultaneous Promise.all execution', async () => {
      const tenantId = 'tenant_stress_single';
      const year = 2026;
      const CONCURRENCY_COUNT = 50;

      // Fire 50 asynchronous requests concurrently
      const tasks = Array.from({ length: CONCURRENCY_COUNT }, () =>
        generator.getNextReceiptNumber(tenantId, year),
      );

      const results = await Promise.all(tasks);

      // 1. Collision-Safe Guarantee: Every generated receipt number is distinct
      const uniqueValues = new Set(results.map((r) => r.value));
      expect(uniqueValues.size).toBe(CONCURRENCY_COUNT);

      // 2. Format Compliance
      for (const receiptNumber of results) {
        expect(receiptNumber.value).toMatch(/^REC-2026-\d{6}$/);
      }

      // 3. Gap-Free Sequence Progression: Values must span 1 to CONCURRENCY_COUNT exactly
      const sequenceIndices = results
        .map((r) => parseInt(r.value.replace('REC-2026-', ''), 10))
        .sort((a, b) => a - b);

      expect(sequenceIndices[0]).toBe(1);
      expect(sequenceIndices[CONCURRENCY_COUNT - 1]).toBe(CONCURRENCY_COUNT);

      for (let i = 0; i < CONCURRENCY_COUNT; i++) {
        expect(sequenceIndices[i]).toBe(i + 1);
      }

      expect(generator.getCounterValue(tenantId, year)).toBe(CONCURRENCY_COUNT);
    });
  });

  describe('Multi-Tenant Concurrent Isolation', () => {
    it('ensures independent gap-free sequences across 4 tenants under interleaved concurrent load', async () => {
      const year = 2026;
      const TENANTS = ['tenant_alpha', 'tenant_beta', 'tenant_gamma', 'tenant_delta'];
      const CALLS_PER_TENANT = 25;
      const TOTAL_CALLS = TENANTS.length * CALLS_PER_TENANT; // 100 concurrent operations

      // Interleave calls from all 4 tenants simultaneously
      const interleavedTasks: Array<{ tenant: string; promise: Promise<ReceiptNumber> }> = [];

      for (let i = 0; i < CALLS_PER_TENANT; i++) {
        for (const tenant of TENANTS) {
          interleavedTasks.push({
            tenant,
            promise: generator.getNextReceiptNumber(tenant, year),
          });
        }
      }

      const settled = await Promise.all(
        interleavedTasks.map(async (item) => ({
          tenant: item.tenant,
          receiptNumber: await item.promise,
        })),
      );

      expect(settled.length).toBe(TOTAL_CALLS);

      // Verify each tenant independently started at 1 and progressed to 25 without any gaps or interference
      for (const tenant of TENANTS) {
        const tenantReceipts = settled
          .filter((s) => s.tenant === tenant)
          .map((s) => s.receiptNumber.value);

        expect(tenantReceipts.length).toBe(CALLS_PER_TENANT);

        const uniqueTenantValues = new Set(tenantReceipts);
        expect(uniqueTenantValues.size).toBe(CALLS_PER_TENANT);

        const indices = tenantReceipts
          .map((r) => parseInt(r.replace('REC-2026-', ''), 10))
          .sort((a, b) => a - b);

        expect(indices[0]).toBe(1);
        expect(indices[CALLS_PER_TENANT - 1]).toBe(CALLS_PER_TENANT);

        for (let i = 0; i < CALLS_PER_TENANT; i++) {
          expect(indices[i]).toBe(i + 1);
        }

        expect(generator.getCounterValue(tenant, year)).toBe(CALLS_PER_TENANT);
      }
    });
  });

  describe('Memory and State Management', () => {
    it('clears all internal counters and queues upon reset()', async () => {
      await generator.getNextReceiptNumber('tenant_1', 2026);
      await generator.getNextReceiptNumber('tenant_2', 2026);

      expect(generator.getCounterValue('tenant_1', 2026)).toBe(1);
      expect(generator.getCounterValue('tenant_2', 2026)).toBe(1);

      generator.reset();

      expect(generator.getCounterValue('tenant_1', 2026)).toBe(0);
      expect(generator.getCounterValue('tenant_2', 2026)).toBe(0);

      const afterReset = await generator.getNextReceiptNumber('tenant_1', 2026);
      expect(afterReset.value).toBe('REC-2026-000001');
    });
  });
});
