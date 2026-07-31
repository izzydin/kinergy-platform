/**
 * Architecture Verification Tests for `modules/client`
 *
 * These tests enforce the Hexagonal Architecture boundary rules for the Client bounded
 * context at test-time, without relying on an external architecture library.
 *
 * Rules verified:
 * 1. The public barrel (`index.ts`) MUST NOT export internal aggregates, Prisma
 *    repositories, domain errors, command handlers, or HTTP controllers.
 * 2. The `public/` layer MUST NOT import from `infrastructure/` or `presentation/`.
 * 3. Integration event contracts MUST be immutable (all properties declared `readonly`).
 * 4. `ClientSummaryDto` MUST NOT expose internal fields (`identityId`, `version`, etc.).
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const moduleRoot = path.resolve(__dirname, '..');
const publicRoot = path.join(moduleRoot, 'public');
const eventsRoot = path.join(publicRoot, 'events');

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(moduleRoot, relPath), 'utf-8');
}

function readPublicSrc(relPath: string): string {
  return fs.readFileSync(path.join(publicRoot, relPath), 'utf-8');
}

// ---------------------------------------------------------------------------
// Rule 1 – Public barrel must not export internal symbols
// ---------------------------------------------------------------------------

describe('Rule 1: Public barrel (index.ts) boundary', () => {
  let barrel: string;

  beforeAll(() => {
    barrel = readSrc('index.ts');
  });

  it('MUST NOT re-export from domain/aggregates (Client aggregate root)', () => {
    expect(barrel).not.toMatch(/from\s+['"].*domain\/aggregates/);
    expect(barrel).not.toMatch(/from\s+['"].*\.\/domain/);
  });

  it('MUST NOT re-export from infrastructure/ (Prisma repos, mapper)', () => {
    expect(barrel).not.toMatch(/from\s+['"].*infrastructure/);
    expect(barrel).not.toMatch(/from\s+['"].*\.\/infrastructure/);
  });

  it('MUST NOT re-export from presentation/ (controllers, filters)', () => {
    expect(barrel).not.toMatch(/from\s+['"].*presentation/);
    expect(barrel).not.toMatch(/from\s+['"].*\.\/presentation/);
  });

  it('MUST NOT re-export internal application layer directly (commands, queries, exceptions)', () => {
    // The barrel must route through public/ — not expose raw application internals
    expect(barrel).not.toMatch(/from\s+['"].*\.\/application['"]$/m);
    expect(barrel).not.toMatch(/from\s+['"].*application\/commands/);
    expect(barrel).not.toMatch(/from\s+['"].*application\/exceptions/);
  });

  it('MUST export ClientFacade from public/', () => {
    expect(barrel).toMatch(/from\s+['"].*public\/client\.facade['"]/);
  });

  it('MUST export IClientFacade from public/', () => {
    expect(barrel).toMatch(/from\s+['"].*public\/interfaces\/client-facade\.interface['"]/);
  });

  it('MUST export integration events from public/events/', () => {
    expect(barrel).toMatch(/client-created\.integration-event/);
    expect(barrel).toMatch(/client-archived\.integration-event/);
    expect(barrel).toMatch(/client-restored\.integration-event/);
    expect(barrel).toMatch(/identity-linked\.integration-event/);
  });
});

// ---------------------------------------------------------------------------
// Rule 2 – public/ layer dependency direction
// ---------------------------------------------------------------------------

describe('Rule 2: public/ layer must not import from infrastructure/ or presentation/', () => {
  const publicFiles: string[] = [];

  beforeAll(() => {
    // Collect all .ts files under public/
    function collectTs(dir: string): void {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) collectTs(full);
        else if (entry.name.endsWith('.ts')) publicFiles.push(full);
      }
    }
    collectTs(publicRoot);
  });

  it('should find at least one file in public/', () => {
    expect(publicFiles.length).toBeGreaterThan(0);
  });

  it('MUST NOT import from infrastructure/', () => {
    for (const file of publicFiles) {
      const src = fs.readFileSync(file, 'utf-8');
      expect(src).not.toMatch(/from\s+['"].*infrastructure/);
    }
  });

  it('MUST NOT import from presentation/', () => {
    for (const file of publicFiles) {
      const src = fs.readFileSync(file, 'utf-8');
      expect(src).not.toMatch(/from\s+['"].*presentation/);
    }
  });
});

// ---------------------------------------------------------------------------
// Rule 3 – Integration event immutability
// ---------------------------------------------------------------------------

describe('Rule 3: Integration event contracts are immutable', () => {
  const eventFiles = [
    'client-created.integration-event.ts',
    'client-archived.integration-event.ts',
    'client-restored.integration-event.ts',
    'identity-linked.integration-event.ts',
  ];

  for (const eventFile of eventFiles) {
    it(`${eventFile} — all declared class properties must be readonly`, () => {
      const src = fs.readFileSync(path.join(eventsRoot, eventFile), 'utf-8');

      // Strip block comments so JSDoc content doesn't interfere
      const srcNoComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');

      // Class-body properties appear at exactly 2-space (or single-level) indentation.
      // We look for lines matching: `  <identifier>: <type>` WITHOUT `readonly` prefix.
      // We deliberately anchor to `^  ` (2 spaces) to match class body but not
      // constructor payload object literal fields (which are inside nested `{}`).
      // The pattern must NOT start with `readonly`, `constructor`, `this`, `}`, or import keywords.
      const nonReadonlyClassProp =
        /^[ ]{2}(?!readonly\b)(?!constructor\b)(?!this\.)(?!}\b)(?!\/\/)[a-zA-Z_$][\w$]*\s*[!?]?\s*:/m;

      expect(srcNoComments).not.toMatch(nonReadonlyClassProp);
    });

    it(`${eventFile} — must declare schemaVersion as literal type 1`, () => {
      const src = fs.readFileSync(path.join(eventsRoot, eventFile), 'utf-8');
      expect(src).toMatch(/schemaVersion.*=\s*1/);
    });

    it(`${eventFile} — must include eventId field`, () => {
      const src = fs.readFileSync(path.join(eventsRoot, eventFile), 'utf-8');
      expect(src).toMatch(/readonly\s+eventId/);
    });

    it(`${eventFile} — must include occurredAt field`, () => {
      const src = fs.readFileSync(path.join(eventsRoot, eventFile), 'utf-8');
      expect(src).toMatch(/readonly\s+occurredAt/);
    });
  }
});

// ---------------------------------------------------------------------------
// Rule 4 – ClientSummaryDto surface area
// ---------------------------------------------------------------------------

describe('Rule 4: ClientSummaryDto public surface area', () => {
  let summarySrc: string;
  let classBodyOnly: string;

  beforeAll(() => {
    summarySrc = readPublicSrc('dto/client-summary.dto.ts');
    // Strip JSDoc / block comments so @remarks mentions of excluded fields
    // do not trigger false positives — we only want to check the class body.
    classBodyOnly = summarySrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
  });

  it('MUST contain id, referenceNumber, fullName, email, phone, status', () => {
    expect(classBodyOnly).toMatch(/\bfullName\b/);
    expect(classBodyOnly).toMatch(/\breferenceNumber\b/);
    expect(classBodyOnly).toMatch(/\bid\b/);
    expect(classBodyOnly).toMatch(/\bemail\b/);
    expect(classBodyOnly).toMatch(/\bphone\b/);
    expect(classBodyOnly).toMatch(/\bstatus\b/);
  });

  it('MUST NOT expose identityId (internal field)', () => {
    expect(classBodyOnly).not.toMatch(/\bidentityId\b/);
  });

  it('MUST NOT expose version (internal field)', () => {
    expect(classBodyOnly).not.toMatch(/\bversion\b/);
  });

  it('MUST NOT expose createdAt or updatedAt (internal fields)', () => {
    expect(classBodyOnly).not.toMatch(/\bcreatedAt\b/);
    expect(classBodyOnly).not.toMatch(/\bupdatedAt\b/);
  });
});

// ---------------------------------------------------------------------------
// Rule 5 – ClientFacade interface completeness
// ---------------------------------------------------------------------------

describe('Rule 5: IClientFacade declares all required methods', () => {
  let ifaceSrc: string;

  beforeAll(() => {
    ifaceSrc = readPublicSrc('interfaces/client-facade.interface.ts');
  });

  it('declares getClientProfile', () => {
    expect(ifaceSrc).toMatch(/getClientProfile/);
  });

  it('declares getClientSummary', () => {
    expect(ifaceSrc).toMatch(/getClientSummary/);
  });

  it('declares isClientActive', () => {
    expect(ifaceSrc).toMatch(/isClientActive/);
  });

  it('declares searchClientsSummary', () => {
    expect(ifaceSrc).toMatch(/searchClientsSummary/);
  });

  it('declares CLIENT_FACADE_TOKEN injection token', () => {
    expect(ifaceSrc).toMatch(/CLIENT_FACADE_TOKEN/);
  });
});
