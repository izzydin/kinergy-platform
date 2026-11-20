import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

// 1. Ensure DATABASE_URL is loaded from .env
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const match = envContent.match(/^DATABASE_URL=(.*)$/m);
  if (match && match[1]) {
    process.env.DATABASE_URL = match[1].trim();
  }
}

const prisma = new PrismaClient();

// 2. Deterministic Pseudo-Random Vector Generator (Mulberry32)
class SeededRng {
  private s: number;
  constructor(seed: number) {
    this.s = seed;
  }
  public nextFloat(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  public nextGaussian(): number {
    let u = 0,
      v = 0;
    while (u === 0) u = this.nextFloat();
    while (v === 0) v = this.nextFloat();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }
}

function generateNormalizedVector(rng: SeededRng, dimensions = 1024): number[] {
  const vec = new Array(dimensions);
  let sumSq = 0;
  for (let i = 0; i < dimensions; i++) {
    const val = rng.nextGaussian();
    vec[i] = val;
    sumSq += val * val;
  }
  const norm = Math.sqrt(sumSq);
  for (let i = 0; i < dimensions; i++) {
    vec[i] = Number((vec[i] / norm).toFixed(7));
  }
  return vec;
}

function vectorToSql(vec: number[]): string {
  return `[${vec.join(',')}]`;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  const weight = idx - lower;
  return Number((sorted[lower] * (1 - weight) + sorted[upper] * weight).toFixed(2));
}

// Result Interfaces
interface BenchmarkSummary {
  postgresVersion: string;
  pgvectorVersion: string;
  hardware: string;
  totalVectors: number;
  dimensions: number;
  distanceMetricResults: any;
  exactBaseline: any;
  indexComparison: any;
  recallResults: any;
  filteredResults: any;
  insertThroughput: any;
}

async function main() {
  console.log('================================================================');
  console.log('AI-05.7: POSTGRESQL PGVECTOR BENCHMARK & OPTIMIZATION SUITE');
  console.log('================================================================');

  // Query environment
  const pgVer = await prisma.$queryRawUnsafe<Array<{ version: string }>>('SELECT version();');
  const extVer = await prisma.$queryRawUnsafe<Array<{ extversion: string }>>(
    "SELECT extversion FROM pg_extension WHERE extname = 'vector';",
  );
  console.log(`PostgreSQL: ${(pgVer[0]?.version ?? '').split(' on ')[0]}`);
  console.log(`pgvector:   ${extVer[0]?.extversion ?? 'unknown'}`);

  const rng = new SeededRng(42);
  const dimensions = 1024;
  const targetScale = 20000; // 20,000 vectors for production-representative evaluation

  const countRows = await prisma.$queryRawUnsafe<Array<{ count: string | number }>>(
    `SELECT count(*)::int as count FROM "document_embeddings";`,
  );
  const currentCount = Number(countRows[0]?.count ?? 0);
  const needSeed = currentCount < targetScale;

  if (needSeed) {
    console.log(`\n[SETUP] Cleaning existing benchmark data...`);
    await prisma.$executeRawUnsafe(`DELETE FROM "document_embeddings";`);
    await prisma.$executeRawUnsafe(`DELETE FROM "knowledge_chunks";`);
    await prisma.$executeRawUnsafe(`DELETE FROM "document_versions";`);
    await prisma.$executeRawUnsafe(`DELETE FROM "knowledge_documents";`);
    await prisma.$executeRawUnsafe(`DELETE FROM "index_generations";`);
    await prisma.$executeRawUnsafe(`DELETE FROM "embedding_profiles";`);
  } else {
    console.log(`\n[SETUP] Found ${currentCount} existing vectors. Reusing seeded dataset.`);
  }

  // Ensure default profile exists
  await prisma.$executeRawUnsafe(`
    INSERT INTO "embedding_profiles" (
      "id", "profile_id", "provider", "model_name", "model_version",
      "model_digest", "dimensions", "tokenizer_identity", "normalization_policy",
      "pooling_strategy", "embedding_type", "created_at"
    ) VALUES (
      'prof-001', 'prof_bge-m3_1024_dense', 'ollama', 'bge-m3', 'latest',
      'sha256:bge-m3-actual-digest', 1024, 'BAAI/bge-m3', 'UNIT_L2', 'CLS', 'DENSE', NOW()
    ) ON CONFLICT DO NOTHING;
  `);

  // Create Generations
  const generations = [
    { id: 'gen-alpha-active', tenantId: 'tenant-alpha', num: 1, status: 'ACTIVE' },
    { id: 'gen-alpha-retired', tenantId: 'tenant-alpha', num: 2, status: 'RETIRED' },
    { id: 'gen-beta-active', tenantId: 'tenant-beta', num: 1, status: 'ACTIVE' },
    { id: 'gen-gamma-active', tenantId: 'tenant-gamma', num: 1, status: 'ACTIVE' },
  ];

  for (const g of generations) {
    await prisma.$executeRawUnsafe(
      `
      INSERT INTO "index_generations" (
        "id", "tenant_id", "generation_number", "profile_id", "status", "version", "created_at"
      ) VALUES ($1, $2, $3, 'prof_bge-m3_1024_dense', $4::"IndexGenerationStatus", 1, NOW())
      ON CONFLICT DO NOTHING;
    `,
      g.id,
      g.tenantId,
      g.num,
      g.status,
    );
  }

  // Distribution:
  // Alpha: 60% (Active: 48% = 9600, Retired: 12% = 2400)
  // Beta: 30% (Active: 6000)
  // Gamma: 10% (Active: 2000)
  const distribution = [
    { genId: 'gen-alpha-active', tenantId: 'tenant-alpha', count: Math.round(targetScale * 0.48) },
    { genId: 'gen-alpha-retired', tenantId: 'tenant-alpha', count: Math.round(targetScale * 0.12) },
    { genId: 'gen-beta-active', tenantId: 'tenant-beta', count: Math.round(targetScale * 0.3) },
    { genId: 'gen-gamma-active', tenantId: 'tenant-gamma', count: Math.round(targetScale * 0.1) },
  ];

  if (needSeed) {
    console.log(`\n[SEED] Seeding ${targetScale} multi-tenant vectors across 4 generations...`);
    const seedStartTime = Date.now();
    let globalChunkSeq = 0;
    let globalDocSeq = 0;

    for (const dist of distribution) {
      const chunksPerDoc = 10;
      const docCount = Math.ceil(dist.count / chunksPerDoc);
      console.log(`  Seeding ${dist.count} vectors for ${dist.tenantId} (${dist.genId})...`);

      const docBatch: string[] = [];
      const verBatch: string[] = [];
      const docIds: string[] = [];
      const verIds: string[] = [];

      for (let d = 0; d < docCount; d++) {
        globalDocSeq++;
        const docId = `doc-${dist.tenantId}-${globalDocSeq}`;
        const verId = `ver-${dist.tenantId}-${globalDocSeq}-v1`;
        docIds.push(docId);
        verIds.push(verId);

        docBatch.push(
          `('${docId}', '${dist.tenantId}', 'Benchmark Doc ${globalDocSeq}', 'system-benchmark', 1, NOW())`,
        );
        verBatch.push(
          `('${verId}', '${docId}', 1, 'benchmark.pdf', 'application/pdf', 1024, 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e', 'bench/key', 'es', 'system')`,
        );
      }

      // Insert docs and versions first
      for (let i = 0; i < docBatch.length; i += 100) {
        const sliceD = docBatch.slice(i, i + 100);
        const sliceV = verBatch.slice(i, i + 100);
        await prisma.$executeRawUnsafe(`
        INSERT INTO "knowledge_documents" ("id", "tenant_id", "title", "uploaded_by", "version", "updated_at")
        VALUES ${sliceD.join(',')};
      `);
        await prisma.$executeRawUnsafe(`
        INSERT INTO "document_versions" ("id", "document_id", "version_number", "original_file_name", "mime_type", "file_size", "checksum", "storage_key", "language", "uploaded_by")
        VALUES ${sliceV.join(',')};
      `);
      }

      // Insert chunks and embeddings
      let chunkBatch: string[] = [];
      let embBatch: string[] = [];
      let seededForDist = 0;

      for (let d = 0; d < docCount; d++) {
        const docId = docIds[d];
        const verId = verIds[d];
        const currentDocChunks = Math.min(chunksPerDoc, dist.count - seededForDist);

        for (let c = 0; c < currentDocChunks; c++) {
          globalChunkSeq++;
          seededForDist++;
          const chunkId = `chk-${globalChunkSeq}`;
          const embId = `emb-${globalChunkSeq}`;
          const vec = generateNormalizedVector(rng, dimensions);
          const vecSql = vectorToSql(vec);

          chunkBatch.push(
            `('${chunkId}', '${dist.tenantId}', '${docId}', '${verId}', ${c + 1}, 'Contenido clínico sintético', 40, '{"pageNumber": 1}'::jsonb, 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e')`,
          );
          embBatch.push(
            `('${embId}', '${chunkId}', '${docId}', '${verId}', '${dist.genId}', 'prof_bge-m3_1024_dense', 1024, '${vecSql}'::vector, 'fingerprint-bench', NOW())`,
          );

          if (chunkBatch.length >= 250) {
            await prisma.$executeRawUnsafe(`
            INSERT INTO "knowledge_chunks" ("id", "tenant_id", "document_id", "document_version_id", "sequence", "content", "token_count", "provenance", "checksum")
            VALUES ${chunkBatch.join(',')};
          `);
            await prisma.$executeRawUnsafe(`
            INSERT INTO "document_embeddings" ("id", "chunk_id", "document_id", "document_version_id", "index_generation_id", "profile_id", "dimensions", "embedding", "content_fingerprint", "created_at")
            VALUES ${embBatch.join(',')};
          `);
            chunkBatch = [];
            embBatch = [];
          }
        }
      }

      if (chunkBatch.length > 0) {
        await prisma.$executeRawUnsafe(`
        INSERT INTO "knowledge_chunks" ("id", "tenant_id", "document_id", "document_version_id", "sequence", "content", "token_count", "provenance", "checksum")
        VALUES ${chunkBatch.join(',')};
      `);
        await prisma.$executeRawUnsafe(`
        INSERT INTO "document_embeddings" ("id", "chunk_id", "document_id", "document_version_id", "index_generation_id", "profile_id", "dimensions", "embedding", "content_fingerprint", "created_at")
        VALUES ${embBatch.join(',')};
      `);
        chunkBatch = [];
        embBatch = [];
      }
    }

    const seedDuration = ((Date.now() - seedStartTime) / 1000).toFixed(1);
    console.log(`✓ Seed complete: ${globalChunkSeq} vectors inserted in ${seedDuration}s.`);
  }

  // Drop any existing vector index to start with pure exact search baseline
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "idx_document_embeddings_hnsw";`);
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "idx_document_embeddings_ivfflat";`);
  await prisma.$executeRawUnsafe(`VACUUM ANALYZE "document_embeddings";`);

  // Table Size
  const tableSizeRes = await prisma.$queryRawUnsafe<
    Array<{ total_size: string; table_size: string }>
  >(`
    SELECT 
      pg_size_pretty(pg_total_relation_size('"document_embeddings"')) AS total_size,
      pg_size_pretty(pg_relation_size('"document_embeddings"')) AS table_size;
  `);
  console.log(
    `\nTable Size: ${tableSizeRes[0]?.table_size} (Total with B-trees: ${tableSizeRes[0]?.total_size})`,
  );

  // Generate 50 test queries
  const testQueries: number[][] = [];
  for (let i = 0; i < 50; i++) {
    testQueries.push(generateNormalizedVector(rng, dimensions));
  }

  // ==========================================================================
  // 1. DISTANCE METRIC BENCHMARK & VERIFICATION
  // ==========================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('1. DISTANCE METRIC COMPARISON (Cosine <=> vs Inner Product <#> vs L2 <->)');
  console.log('----------------------------------------------------------------');

  const q0 = vectorToSql(testQueries[0]);
  const k = 10;

  // Compare results of top-10 for q0
  const topCosine = await prisma.$queryRawUnsafe<Array<{ id: string; dist: number }>>(
    `
    SELECT "id", ("embedding" <=> $1::vector) as dist
    FROM "document_embeddings"
    ORDER BY "embedding" <=> $1::vector ASC
    LIMIT ${k};
  `,
    q0,
  );

  const topInner = await prisma.$queryRawUnsafe<Array<{ id: string; dist: number }>>(
    `
    SELECT "id", ("embedding" <#> $1::vector) as dist
    FROM "document_embeddings"
    ORDER BY "embedding" <#> $1::vector ASC
    LIMIT ${k};
  `,
    q0,
  );

  const topL2 = await prisma.$queryRawUnsafe<Array<{ id: string; dist: number }>>(
    `
    SELECT "id", ("embedding" <-> $1::vector) as dist
    FROM "document_embeddings"
    ORDER BY "embedding" <-> $1::vector ASC
    LIMIT ${k};
  `,
    q0,
  );

  const cosineIds = topCosine.map((r) => r.id);
  const innerIds = topInner.map((r) => r.id);
  const l2Ids = topL2.map((r) => r.id);

  const cosineVsInnerMatch = cosineIds.every((id, idx) => id === innerIds[idx]);
  const cosineVsL2Match = cosineIds.every((id, idx) => id === l2Ids[idx]);

  console.log(`Mathematical Ranking Identity:`);
  console.log(
    `  Cosine (<=>) vs Inner Product (<#>): ${cosineVsInnerMatch ? 'STRICTLY IDENTICAL (100% order match)' : 'DIFFERENT'}`,
  );
  console.log(
    `  Cosine (<=>) vs L2 Distance (<->):   ${cosineVsL2Match ? 'STRICTLY IDENTICAL (100% order match)' : 'DIFFERENT'}`,
  );

  // Measure latency for each metric over 30 queries
  async function benchmarkOperator(op: '<=>' | '<#>' | '<->', count = 30): Promise<number[]> {
    const latencies: number[] = [];
    for (let i = 0; i < count; i++) {
      const q = vectorToSql(testQueries[i]);
      const t0 = performance.now();
      await prisma.$queryRawUnsafe(
        `
        SELECT "id" FROM "document_embeddings"
        ORDER BY "embedding" ${op} $1::vector ASC LIMIT ${k};
      `,
        q,
      );
      latencies.push(performance.now() - t0);
    }
    return latencies;
  }

  const cosineLatencies = await benchmarkOperator('<=>');
  const innerLatencies = await benchmarkOperator('<#>');
  const l2Latencies = await benchmarkOperator('<->');

  console.log(`\nOperator Latencies (Exact Scan across 20k rows):`);
  console.log(
    `  Cosine (<=>): p50=${percentile(cosineLatencies, 50)}ms, p95=${percentile(cosineLatencies, 95)}ms, p99=${percentile(cosineLatencies, 99)}ms`,
  );
  console.log(
    `  Inner  (<#>): p50=${percentile(innerLatencies, 50)}ms, p95=${percentile(innerLatencies, 95)}ms, p99=${percentile(innerLatencies, 99)}ms`,
  );
  console.log(
    `  L2     (<->): p50=${percentile(l2Latencies, 50)}ms, p95=${percentile(l2Latencies, 95)}ms, p99=${percentile(l2Latencies, 99)}ms`,
  );

  // ==========================================================================
  // 2. EXACT SEARCH BASELINE (Sequential Scan)
  // ==========================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('2. EXACT SEARCH BASELINE (Sequential Scan / Flat)');
  console.log('----------------------------------------------------------------');

  const exactUnfilteredLatencies: number[] = [];
  const exactFilteredLatencies: number[] = [];

  for (let i = 0; i < testQueries.length; i++) {
    const q = vectorToSql(testQueries[i]);
    // Unfiltered
    const t0 = performance.now();
    await prisma.$queryRawUnsafe(
      `
      SELECT "id" FROM "document_embeddings"
      ORDER BY "embedding" <=> $1::vector ASC LIMIT ${k};
    `,
      q,
    );
    exactUnfilteredLatencies.push(performance.now() - t0);

    // Filtered by Active Gen of Alpha (48% of rows)
    const t1 = performance.now();
    await prisma.$queryRawUnsafe(
      `
      SELECT "id" FROM "document_embeddings"
      WHERE "index_generation_id" = 'gen-alpha-active'
      ORDER BY "embedding" <=> $1::vector ASC LIMIT ${k};
    `,
      q,
    );
    exactFilteredLatencies.push(performance.now() - t1);
  }

  const explainExactUnfiltered = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': string }>>(
    `
    EXPLAIN (ANALYZE, BUFFERS, TIMING)
    SELECT "id" FROM "document_embeddings"
    ORDER BY "embedding" <=> $1::vector ASC LIMIT ${k};
  `,
    q0,
  );

  const explainExactFiltered = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': string }>>(
    `
    EXPLAIN (ANALYZE, BUFFERS, TIMING)
    SELECT "id" FROM "document_embeddings"
    WHERE "index_generation_id" = 'gen-alpha-active'
    ORDER BY "embedding" <=> $1::vector ASC LIMIT ${k};
  `,
    q0,
  );

  console.log(
    `Unfiltered Exact Search: p50=${percentile(exactUnfilteredLatencies, 50)}ms, p95=${percentile(exactUnfilteredLatencies, 95)}ms, p99=${percentile(exactUnfilteredLatencies, 99)}ms`,
  );
  console.log(
    `Filtered Exact Search (Alpha Gen): p50=${percentile(exactFilteredLatencies, 50)}ms, p95=${percentile(exactFilteredLatencies, 95)}ms, p99=${percentile(exactFilteredLatencies, 99)}ms`,
  );
  console.log(
    `\nEXPLAIN Exact Unfiltered:\n${explainExactUnfiltered.map((r) => '  ' + r['QUERY PLAN']).join('\n')}`,
  );
  console.log(
    `\nEXPLAIN Exact Filtered:\n${explainExactFiltered.map((r) => '  ' + r['QUERY PLAN']).join('\n')}`,
  );

  // Ground Truth Map for 50 test queries (for Recall calculations)
  console.log('\n[EVAL] Computing Ground Truth top-10 for 50 queries...');
  const groundTruthUnfiltered: Map<number, string[]> = new Map();
  const groundTruthFiltered: Map<number, string[]> = new Map();

  for (let i = 0; i < testQueries.length; i++) {
    const q = vectorToSql(testQueries[i]);
    const unfilt = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `
      SELECT "id" FROM "document_embeddings"
      ORDER BY "embedding" <=> $1::vector ASC LIMIT ${k};
    `,
      q,
    );
    groundTruthUnfiltered.set(
      i,
      unfilt.map((r) => r.id),
    );

    const filt = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `
      SELECT "id" FROM "document_embeddings"
      WHERE "index_generation_id" = 'gen-alpha-active'
      ORDER BY "embedding" <=> $1::vector ASC LIMIT ${k};
    `,
      q,
    );
    groundTruthFiltered.set(
      i,
      filt.map((r) => r.id),
    );
  }

  // ==========================================================================
  // 3. APPROXIMATE INDEX EVALUATION: HNSW vs IVFFlat
  // ==========================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('3. APPROXIMATE INDEX BUILD & SIZING: HNSW vs IVFFlat');
  console.log('----------------------------------------------------------------');

  // A. Build IVFFlat
  console.log('Building IVFFlat index (lists = 100)...');
  const ivfBuildStart = performance.now();
  await prisma.$executeRawUnsafe(`
    CREATE INDEX "idx_document_embeddings_ivfflat"
    ON "document_embeddings" USING ivfflat ("embedding" vector_cosine_ops)
    WITH (lists = 100);
  `);
  const ivfBuildTime = Number((performance.now() - ivfBuildStart).toFixed(1));

  const ivfSizeRes = await prisma.$queryRawUnsafe<Array<{ size: string; bytes: number }>>(`
    SELECT pg_size_pretty(pg_relation_size('"idx_document_embeddings_ivfflat"')) AS size,
           pg_relation_size('"idx_document_embeddings_ivfflat"') AS bytes;
  `);

  console.log(
    `✓ IVFFlat built in ${ivfBuildTime}ms (${(ivfBuildTime / 1000).toFixed(2)}s). Size: ${ivfSizeRes[0]?.size}`,
  );

  // B. Evaluate IVFFlat across probes
  const ivfProbes = [1, 5, 10];
  const ivfResults: any = {};

  for (const probes of ivfProbes) {
    await prisma.$executeRawUnsafe(`SET ivfflat.probes = ${probes};`);
    const latencies: number[] = [];
    let totalMatches = 0;

    for (let i = 0; i < testQueries.length; i++) {
      const q = vectorToSql(testQueries[i]);
      const t0 = performance.now();
      const res = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `
        SELECT "id" FROM "document_embeddings"
        ORDER BY "embedding" <=> $1::vector ASC LIMIT ${k};
      `,
        q,
      );
      latencies.push(performance.now() - t0);

      const expected = groundTruthUnfiltered.get(i) || [];
      const actual = res.map((r) => r.id);
      const matches = actual.filter((id) => expected.includes(id)).length;
      totalMatches += matches;
    }

    const meanRecall = (totalMatches / (testQueries.length * k)) * 100;
    ivfResults[`probes_${probes}`] = {
      probes,
      meanRecall: Number(meanRecall.toFixed(2)),
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
    };
    console.log(
      `  IVFFlat (probes=${probes}): Recall@10 = ${meanRecall.toFixed(1)}%, p50 = ${percentile(latencies, 50)}ms, p95 = ${percentile(latencies, 95)}ms`,
    );
  }

  // Drop IVFFlat before testing HNSW
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "idx_document_embeddings_ivfflat";`);

  // C. Build HNSW (m = 16, ef_construction = 64)
  console.log('\nBuilding HNSW index (m = 16, ef_construction = 64)...');
  const hnswBuildStart = performance.now();
  await prisma.$executeRawUnsafe(`
    CREATE INDEX "idx_document_embeddings_hnsw"
    ON "document_embeddings" USING hnsw ("embedding" vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
  `);
  const hnswBuildTime = Number((performance.now() - hnswBuildStart).toFixed(1));

  const hnswSizeRes = await prisma.$queryRawUnsafe<Array<{ size: string; bytes: number }>>(`
    SELECT pg_size_pretty(pg_relation_size('"idx_document_embeddings_hnsw"')) AS size,
           pg_relation_size('"idx_document_embeddings_hnsw"') AS bytes;
  `);

  console.log(
    `✓ HNSW built in ${hnswBuildTime}ms (${(hnswBuildTime / 1000).toFixed(2)}s). Size: ${hnswSizeRes[0]?.size}`,
  );

  // D. Evaluate HNSW across ef_search
  const hnswEfValues = [16, 40, 64, 100];
  const hnswResults: any = {};

  for (const ef of hnswEfValues) {
    await prisma.$executeRawUnsafe(`SET hnsw.ef_search = ${ef};`);
    const latencies: number[] = [];
    let totalMatches = 0;

    for (let i = 0; i < testQueries.length; i++) {
      const q = vectorToSql(testQueries[i]);
      const t0 = performance.now();
      const res = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `
        SELECT "id" FROM "document_embeddings"
        ORDER BY "embedding" <=> $1::vector ASC LIMIT ${k};
      `,
        q,
      );
      latencies.push(performance.now() - t0);

      const expected = groundTruthUnfiltered.get(i) || [];
      const actual = res.map((r) => r.id);
      const matches = actual.filter((id) => expected.includes(id)).length;
      totalMatches += matches;
    }

    const meanRecall = (totalMatches / (testQueries.length * k)) * 100;
    hnswResults[`ef_${ef}`] = {
      ef_search: ef,
      meanRecall: Number(meanRecall.toFixed(2)),
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
    };
    console.log(
      `  HNSW (ef_search=${ef}): Recall@10 = ${meanRecall.toFixed(1)}%, p50 = ${percentile(latencies, 50)}ms, p95 = ${percentile(latencies, 95)}ms`,
    );
  }

  // ==========================================================================
  // 4. TENANT AND GENERATION FILTERED BENCHMARKS
  // ==========================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('4. TENANT & GENERATION FILTERED BENCHMARKS');
  console.log('----------------------------------------------------------------');

  // Test 1: Broad Filter (Alpha Active Gen = 9600 rows / 48%)
  // Test 2: Moderate Filter (Beta Active Gen = 6000 rows / 30%)
  // Test 3: Narrow Filter (Gamma Active Gen = 2000 rows / 10%)
  // Test 4: Document Scope (1 document = 10 rows / 0.05%)

  await prisma.$executeRawUnsafe(`SET hnsw.ef_search = 64;`);

  async function benchmarkFilteredScenario(
    label: string,
    whereClause: string,
    groundTruthGenId?: string,
  ) {
    const latencies: number[] = [];
    let totalMatches = 0;
    let crossTenantViolations = 0;

    for (let i = 0; i < testQueries.length; i++) {
      const q = vectorToSql(testQueries[i]);
      const t0 = performance.now();
      const res = await prisma.$queryRawUnsafe<Array<{ id: string; index_generation_id: string }>>(
        `
        SELECT "id", "index_generation_id" FROM "document_embeddings"
        WHERE ${whereClause}
        ORDER BY "embedding" <=> $1::vector ASC LIMIT ${k};
      `,
        q,
      );
      latencies.push(performance.now() - t0);

      if (groundTruthGenId === 'gen-alpha-active') {
        const expected = groundTruthFiltered.get(i) || [];
        const actual = res.map((r) => r.id);
        const matches = actual.filter((id) => expected.includes(id)).length;
        totalMatches += matches;
      }

      // Check for security violations if generation specified
      if (groundTruthGenId) {
        for (const row of res) {
          if (row.index_generation_id !== groundTruthGenId) {
            crossTenantViolations++;
          }
        }
      }
    }

    const recall =
      groundTruthGenId === 'gen-alpha-active'
        ? ((totalMatches / (testQueries.length * k)) * 100).toFixed(1) + '%'
        : 'N/A';

    console.log(`  Scenario: ${label}`);
    console.log(
      `    Latency: p50=${percentile(latencies, 50)}ms, p95=${percentile(latencies, 95)}ms, p99=${percentile(latencies, 99)}ms`,
    );
    console.log(
      `    Recall vs Exact: ${recall} | Cross-Tenant Violations: ${crossTenantViolations}`,
    );

    const explain = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': string }>>(
      `
      EXPLAIN (ANALYZE, BUFFERS, TIMING)
      SELECT "id" FROM "document_embeddings"
      WHERE ${whereClause}
      ORDER BY "embedding" <=> $1::vector ASC LIMIT ${k};
    `,
      q0,
    );
    console.log(`    Plan Summary: ${explain[0]?.['QUERY PLAN']}`);
    return {
      label,
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
      recall,
      crossTenantViolations,
      plan: explain.map((r) => r['QUERY PLAN']).join('\n'),
    };
  }

  const filtAlpha = await benchmarkFilteredScenario(
    'Broad Filter (tenant-alpha Active Gen: 48% data)',
    `"index_generation_id" = 'gen-alpha-active'`,
    'gen-alpha-active',
  );

  const filtGamma = await benchmarkFilteredScenario(
    'Small Tenant Filter (tenant-gamma Active Gen: 10% data)',
    `"index_generation_id" = 'gen-gamma-active'`,
    'gen-gamma-active',
  );

  const filtDoc = await benchmarkFilteredScenario(
    'Highly Selective Document Filter (1 doc = 10 rows)',
    `"index_generation_id" = 'gen-alpha-active' AND "document_id" = 'doc-tenant-alpha-1'`,
  );

  // ==========================================================================
  // 5. INSERT & WRITE THROUGHPUT BENCHMARK
  // ==========================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('5. BATCH INSERT THROUGHPUT (100 vectors)');
  console.log('----------------------------------------------------------------');

  async function benchmarkBatchInsert(label: string): Promise<number> {
    const batchSize = 100;
    const safeLabel = label.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    const testDocId = `doc-bench-ins-${safeLabel}`;
    const testVerId = `ver-bench-ins-${safeLabel}`;

    await prisma.$executeRawUnsafe(
      `
      INSERT INTO "knowledge_documents" ("id", "tenant_id", "title", "uploaded_by", "version", "updated_at")
      VALUES ($1, 'tenant-alpha', 'Insert Bench', 'system', 1, NOW()) ON CONFLICT DO NOTHING;
    `,
      testDocId,
    );

    await prisma.$executeRawUnsafe(
      `
      INSERT INTO "document_versions" (
        "id", "document_id", "version_number", "original_file_name", "mime_type",
        "file_size", "checksum", "storage_key", "language", "uploaded_by"
      ) VALUES ($1, $2, 1, 'f.pdf', 'app/pdf', 100, 'benchchk', 'k', 'es', 's') ON CONFLICT DO NOTHING;
    `,
      testVerId,
      testDocId,
    );

    const t0 = performance.now();
    for (let i = 0; i < batchSize; i++) {
      const chkId = `chk-ins-${safeLabel}-${i}`;
      const embId = `emb-ins-${safeLabel}-${i}`;
      const vec = vectorToSql(generateNormalizedVector(rng, dimensions));

      await prisma.$executeRawUnsafe(
        `
        INSERT INTO "knowledge_chunks" (
          "id", "tenant_id", "document_id", "document_version_id", "sequence",
          "content", "token_count", "provenance", "checksum"
        ) VALUES ($1, 'tenant-alpha', $2, $3, $4, 'content', 10, '{}'::jsonb, 'chk')
        ON CONFLICT DO NOTHING;
      `,
        chkId,
        testDocId,
        testVerId,
        i + 1,
      );

      await prisma.$executeRawUnsafe(
        `
        INSERT INTO "document_embeddings" (
          "id", "chunk_id", "document_id", "document_version_id", "index_generation_id",
          "profile_id", "dimensions", "embedding", "content_fingerprint", "created_at"
        ) VALUES ($1, $2, $3, $4, 'gen-alpha-active', 'prof_bge-m3_1024_dense', 1024, $5::vector, 'fp', NOW())
        ON CONFLICT DO NOTHING;
      `,
        embId,
        chkId,
        testDocId,
        testVerId,
        vec,
      );
    }
    const elapsed = performance.now() - t0;
    console.log(
      `  ${label}: ${batchSize} inserts in ${elapsed.toFixed(1)}ms (${(batchSize / (elapsed / 1000)).toFixed(1)} vectors/sec)`,
    );
    return elapsed;
  }

  const hnswInsertTime = await benchmarkBatchInsert('With HNSW Index');

  // Test without index
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "idx_document_embeddings_hnsw";`);
  const rawInsertTime = await benchmarkBatchInsert('Without Vector Index');

  // Restore HNSW index for application health
  console.log('\n[RESTORE] Recreating production HNSW index...');
  await prisma.$executeRawUnsafe(`
    CREATE INDEX "idx_document_embeddings_hnsw"
    ON "document_embeddings" USING hnsw ("embedding" vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
  `);
  console.log('✓ HNSW index restored.');

  console.log('\n================================================================');
  console.log('AI-05.7 BENCHMARK SUITE EXECUTION COMPLETED SUCCESSFULLY');
  console.log('================================================================');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Benchmark execution failed:', e);
  await prisma.$disconnect();
  process.exit(1);
});
