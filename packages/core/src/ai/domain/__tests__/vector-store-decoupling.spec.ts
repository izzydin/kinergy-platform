import * as fs from 'fs';
import * as path from 'path';

describe('Vector Store & Index Generation Hexagonal Decoupling Guard', () => {
  const domainDir = path.resolve(__dirname, '..');
  const portsDir = path.resolve(__dirname, '../../ports');

  function getTsFiles(dir: string): string[] {
    const files: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__' && entry.name !== 'node_modules') {
          files.push(...getTsFiles(fullPath));
        }
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
    return files;
  }

  const domainFiles = getTsFiles(domainDir);
  const portFiles = getTsFiles(portsDir);
  const allFiles = [...domainFiles, ...portFiles];

  it('must contain ZERO imports of @prisma/client in domain and ports', () => {
    for (const file of allFiles) {
      const content = fs.readFileSync(file, 'utf8');
      expect(content).not.toMatch(/from\s+['"]@prisma\/client['"]/);
      expect(content).not.toMatch(/import\s+.*@prisma\/client/);
    }
  });

  it('must contain ZERO imports or usages of pgvector native types in domain and ports', () => {
    for (const file of allFiles) {
      const content = fs.readFileSync(file, 'utf8');
      expect(content).not.toMatch(/from\s+['"]pgvector['"]/);
      expect(content).not.toMatch(/Unsupported\s*\(\s*['"]vector/);
    }
  });

  it('must contain ZERO imports or direct bindings to ollama SDK in domain and ports', () => {
    for (const file of allFiles) {
      const content = fs.readFileSync(file, 'utf8');
      expect(content).not.toMatch(/from\s+['"]ollama['"]/);
      expect(content).not.toMatch(/from\s+['"]@ollama/);
    }
  });

  it('must contain ZERO usages of TypeScript "any" in vector indexing domain code', () => {
    const ai05DomainFiles = domainFiles.filter(
      (f) =>
        f.includes('embedding') ||
        f.includes('index-generation') ||
        f.includes('vector') ||
        f.includes('vector-store'),
    );

    for (const file of ai05DomainFiles) {
      const content = fs.readFileSync(file, 'utf8');
      // Matches ": any", "as any", "<any>"
      const hasExplicitAny = /:\s*any\b|\bas\s+any\b|<any>/.test(content);
      expect(hasExplicitAny).toBe(false);
    }
  });
});
