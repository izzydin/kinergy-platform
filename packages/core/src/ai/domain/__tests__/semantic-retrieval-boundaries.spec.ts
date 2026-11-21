import * as fs from 'fs';
import * as path from 'path';

describe('AI-06 Semantic Retrieval Architecture Boundaries', () => {
  const domainDir = path.resolve(__dirname, '..');

  it('domain layer must have ZERO imports from @nestjs, prisma, @prisma/client, or ollama', () => {
    const prohibitedPatterns = [/@nestjs/i, /@prisma\/client/i, /prisma/i, /ollama/i, /pgvector/i];

    function checkDir(dir: string): void {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__') {
            checkDir(fullPath);
          }
        } else if (entry.name.endsWith('.ts')) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          for (const pattern of prohibitedPatterns) {
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              if (line && line.trim().startsWith('import ') && pattern.test(line)) {
                throw new Error(
                  `Boundary violation in ${fullPath}:${i + 1}: Prohibited import '${line.trim()}'`,
                );
              }
            }
          }
        }
      }
    }

    checkDir(domainDir);
  });
});
