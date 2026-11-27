import * as fs from 'fs';
import * as path from 'path';
import {
  DocumentFormat,
  ExtractedBlockType,
  ExtractionTimeoutException,
  ExtractionResourceLimitExceededException,
  InvalidFormatExtractionException,
  ExtractedDocument,
  ExtractedBlock,
} from '@kinergy-platform/core';
import { ParserSandboxService } from '../services/parser-sandbox.service';
import { TempFileStorageService } from '../services/temp-file-storage.service';
import {
  DocxParserAdapter,
  PdfParserAdapter,
  MarkdownParserAdapter,
  PlainTextParserAdapter,
  CompositeDocumentParserAdapter,
} from '../adapters/parsers';
import {
  buildZipArchive,
  createValidDocx,
  createSinglePagePdf,
} from '../adapters/parsers/__tests__/parser-fixtures';

describe('AI-10.3-06 — Parser Isolation & Resource Controls (Integration)', () => {
  let sandbox: ParserSandboxService;
  let compositeParser: CompositeDocumentParserAdapter;
  let docxAdapter: DocxParserAdapter;
  let pdfAdapter: PdfParserAdapter;
  let mdAdapter: MarkdownParserAdapter;
  let txtAdapter: PlainTextParserAdapter;
  let tempStorage: TempFileStorageService;

  beforeEach(() => {
    sandbox = new ParserSandboxService();
    docxAdapter = new DocxParserAdapter();
    pdfAdapter = new PdfParserAdapter();
    mdAdapter = new MarkdownParserAdapter();
    txtAdapter = new PlainTextParserAdapter();

    compositeParser = new CompositeDocumentParserAdapter(
      pdfAdapter,
      docxAdapter,
      mdAdapter,
      txtAdapter,
      sandbox,
    );

    tempStorage = new TempFileStorageService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =========================================================================
  // Scenario 1: Parser Timeout
  // =========================================================================
  describe('Scenario 1: Parser timeout enforcement', () => {
    it('aborts long-running parser operations exceeding timeout and raises ExtractionTimeoutException', async () => {
      const slowTask = () =>
        new Promise<ExtractedDocument>(() => {
          // Never resolves within the timeout window
        });

      await expect(
        sandbox.executeWithSandbox(slowTask, {
          timeoutMs: 50,
          documentId: 'slow-doc-1',
          documentVersionId: 'v1',
        }),
      ).rejects.toThrow(ExtractionTimeoutException);
    });
  });

  // =========================================================================
  // Scenario 2: Parser Memory or Resource-Limit Violation
  // =========================================================================
  describe('Scenario 2: Parser memory & resource-limit violation (>5M extracted characters)', () => {
    it('rejects documents whose extracted text exceeds max character threshold', async () => {
      const hugeText = 'A'.repeat(1000);
      const mockDoc = ExtractedDocument.create({
        documentId: 'doc-huge',
        documentVersionId: 'v1',
        sourceFormat: DocumentFormat.TXT,
        title: 'Huge Text Doc',
        blocks: [
          ExtractedBlock.create({
            type: ExtractedBlockType.PARAGRAPH,
            text: hugeText,
            sequence: 0,
          }),
        ],
        metadata: { parserName: 'mock', pageCount: 1, totalChars: 1000 },
      });

      // Bounded to 500 characters
      expect(() => {
        sandbox.sanitizeExtractedDocument(mockDoc, 500);
      }).toThrow(ExtractionResourceLimitExceededException);
    });

    it('DocxParserAdapter rejects extraction when uncompressed text exceeds character limit', async () => {
      const limitedDocxAdapter = new DocxParserAdapter({
        maxExtractedChars: 20, // Strict 20 char limit for test
      });

      const docxBuffer = createValidDocx();

      await expect(
        limitedDocxAdapter.parse({
          tenantId: 'tenant-1',
          documentId: 'doc-limit-1',
          documentVersionId: 'v1',
          format: DocumentFormat.DOCX,
          buffer: docxBuffer,
        }),
      ).rejects.toThrow(ExtractionResourceLimitExceededException);
    });
  });

  // =========================================================================
  // Scenario 3: Malformed and Corrupted Files
  // =========================================================================
  describe('Scenario 3: Malformed and corrupted files fail gracefully without crashes', () => {
    it('gracefully handles truncated corrupted PDF buffer', async () => {
      const truncatedPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog');

      await expect(
        compositeParser.parse({
          tenantId: 'tenant-1',
          documentId: 'corrupt-pdf-1',
          documentVersionId: 'v1',
          format: DocumentFormat.PDF,
          buffer: truncatedPdf,
        }),
      ).rejects.toThrow(InvalidFormatExtractionException);
    });

    it('gracefully handles corrupted non-ZIP DOCX buffer', async () => {
      const corruptDocx = Buffer.from('PK\x03\x04corrupted-garbage-not-valid-zip');

      await expect(
        compositeParser.parse({
          tenantId: 'tenant-1',
          documentId: 'corrupt-docx-1',
          documentVersionId: 'v1',
          format: DocumentFormat.DOCX,
          buffer: corruptDocx,
        }),
      ).rejects.toThrow();
    });

    it('gracefully handles binary null bytes in Plain Text files', async () => {
      const binaryDisguisedAsTxt = Buffer.from('Plain text header\x00\x01\x02binary payload');

      await expect(
        compositeParser.parse({
          tenantId: 'tenant-1',
          documentId: 'corrupt-txt-1',
          documentVersionId: 'v1',
          format: DocumentFormat.TXT,
          buffer: binaryDisguisedAsTxt,
        }),
      ).rejects.toThrow(InvalidFormatExtractionException);
    });
  });

  // =========================================================================
  // Scenario 4: Filename and Argument Injection Attempts
  // =========================================================================
  describe('Scenario 4: Filename and argument injection attempts are treated as inert strings', () => {
    it('treats dangerous command injection strings in originalFileName purely as metadata labels', async () => {
      const injectionName = '; rm -rf / ; & dir | calc.exe`id`$(whoami).docx';
      const docxBuffer = createValidDocx();

      const doc = await compositeParser.parse({
        tenantId: 'tenant-1',
        documentId: 'doc-cmd-inject',
        documentVersionId: 'v1',
        format: DocumentFormat.DOCX,
        buffer: docxBuffer,
        originalFileName: injectionName,
      });

      expect(doc.title).toBeDefined();
      expect(typeof doc.title).toBe('string');
    });

    it('executeSafeSubprocess rejects executable paths containing shell metacharacters', async () => {
      await expect(sandbox.executeSafeSubprocess('node; rm -rf /', ['--version'])).rejects.toThrow(
        /forbidden shell metacharacters/i,
      );

      await expect(sandbox.executeSafeSubprocess('cat | whoami', ['file.txt'])).rejects.toThrow(
        /forbidden shell metacharacters/i,
      );

      await expect(sandbox.executeSafeSubprocess('`calc.exe`', [])).rejects.toThrow(
        /forbidden shell metacharacters/i,
      );
    });

    it('executeSafeSubprocess executes safely with explicit arguments array without shell interpretation', async () => {
      const result = await sandbox.executeSafeSubprocess(process.execPath, [
        '-e',
        'console.log("safe-execution-verified");',
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('safe-execution-verified');
    });
  });

  // =========================================================================
  // Scenario 5: XML External Entity (XXE) Protections
  // =========================================================================
  describe('Scenario 5: XML External Entity (XXE) protections in DOCX packages', () => {
    it('parses DOCX with XML entity definitions without expanding external entities or leaking files', async () => {
      const xxeBody = `
        <!DOCTYPE test [
          <!ENTITY xxe SYSTEM "file:///etc/passwd">
        ]>
        <w:p>
          <w:r><w:t>&xxe; Contenido seguro posterior</w:t></w:r>
        </w:p>`;

      const xxeDocx = createValidDocx(xxeBody);

      try {
        const doc = await docxAdapter.parse({
          tenantId: 'tenant-1',
          documentId: 'doc-xxe',
          documentVersionId: 'v1',
          format: DocumentFormat.DOCX,
          buffer: xxeDocx,
        });

        const allText = doc.toFullPlainText();
        expect(allText).not.toContain('root:x:0:0:');
        expect(allText).not.toContain('/bin/bash');
      } catch (err: unknown) {
        // Rejecting document due to XML entity syntax or xmldom failure is also secure
        expect(err).toBeInstanceOf(InvalidFormatExtractionException);
        expect((err as Error).message).toContain('xmldom error');
      }
    });
  });

  // =========================================================================
  // Scenario 6: External URL Resolution Denial (SSRF Prevention)
  // =========================================================================
  describe('Scenario 6: External URL resolution denial (SSRF prevention)', () => {
    it('guarantees zero outbound network calls and safe image suppression during DOCX parsing', async () => {
      let fetchCalled = false;
      if (typeof global.fetch === 'function') {
        jest.spyOn(global, 'fetch').mockImplementation(() => {
          fetchCalled = true;
          return Promise.reject(new Error('Outbound network request blocked by sandbox policy'));
        });
      }

      const relationshipXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="http://169.254.169.254/latest/meta-data/" TargetMode="External"/>
      </Relationships>`;

      const docWithExternalUrl = buildZipArchive([
        {
          name: '[Content_Types].xml',
          content: Buffer.from(
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
          ),
        },
        {
          name: 'word/_rels/document.xml.rels',
          content: Buffer.from(relationshipXml),
        },
        {
          name: 'word/document.xml',
          content: Buffer.from(
            `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
              <w:body>
                <w:p><w:r><w:t>Documento clinico con imagen externa</w:t></w:r></w:p>
              </w:body>
            </w:document>`,
          ),
        },
      ]);

      const doc = await docxAdapter.parse({
        tenantId: 'tenant-1',
        documentId: 'doc-ssrf-1',
        documentVersionId: 'v1',
        format: DocumentFormat.DOCX,
        buffer: docWithExternalUrl,
      });

      expect(doc).toBeDefined();
      expect(doc.sourceFormat).toBe(DocumentFormat.DOCX);
      expect(doc.toFullPlainText()).toContain('Documento clinico con imagen externa');
      expect(fetchCalled).toBe(false);
    });
  });

  // =========================================================================
  // Scenario 7: Local-File Access Denial (LFI Prevention)
  // =========================================================================
  describe('Scenario 7: Local-file access denial (LFI prevention)', () => {
    it('prevents parsers from reading arbitrary host filesystem paths outside input buffer', async () => {
      const lfiXmlBody = `
        <w:p>
          <w:r><w:t>Referencia a archivo local: file:///etc/shadow</w:t></w:r>
        </w:p>`;
      const lfiDocx = createValidDocx(lfiXmlBody);

      const doc = await docxAdapter.parse({
        tenantId: 'tenant-1',
        documentId: 'doc-lfi-1',
        documentVersionId: 'v1',
        format: DocumentFormat.DOCX,
        buffer: lfiDocx,
      });

      expect(doc).toBeDefined();
      const allText = doc.toFullPlainText();
      // Ensure file:/// link was not traversed and real system files were not ingested
      expect(allText).not.toContain('root:$6$');
      expect(allText).not.toContain('[boot loader]');
      expect(allText).toContain('Referencia a archivo local');
    });
  });

  // =========================================================================
  // Scenario 8: Temporary-File Cleanup During Parsing
  // =========================================================================
  describe('Scenario 8: Temporary-file cleanup during parsing', () => {
    it('guarantees temp files and folders are purged even when parser fails or throws', async () => {
      let createdFilePath = '';
      let createdDir = '';

      const failingTask = async (filePath: string) => {
        createdFilePath = filePath;
        createdDir = path.dirname(filePath);

        expect(fs.existsSync(createdFilePath)).toBe(true);
        throw new Error('Simulated parser failure midway through processing');
      };

      await expect(
        tempStorage.executeWithTempFile(
          'tenant-cleanup-test',
          Buffer.from('temporary scratch content for parsing'),
          'bin',
          failingTask,
        ),
      ).rejects.toThrow('Simulated parser failure midway through processing');

      expect(fs.existsSync(createdFilePath)).toBe(false);
      expect(fs.existsSync(createdDir)).toBe(false);
    });
  });

  // =========================================================================
  // Scenario 9: Child-Process Termination After Failure (Zombie Prevention)
  // =========================================================================
  describe('Scenario 9: Child-process termination after failure (zombie prevention)', () => {
    it('terminates hanging child processes upon timeout and rejects cleanly', async () => {
      const hangingScript = 'setInterval(() => {}, 1000);';

      const startTime = Date.now();
      await expect(
        sandbox.executeSafeSubprocess(process.execPath, ['-e', hangingScript], { timeoutMs: 150 }),
      ).rejects.toThrow(/timed out after 150ms and was terminated/i);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(3000);
    });
  });

  // =========================================================================
  // Scenario 10: Secret & Diagnostics Isolation
  // =========================================================================
  describe('Scenario 10: No application secrets exposed to parser execution or diagnostics', () => {
    it('scrubs database credentials, JWT secrets, and bearer tokens from error messages', () => {
      const rawLeakedError =
        'Connection failure to postgres://admin:super_secret_db_pass@db.kynergy.internal:5432/kynergy_prod with JWT eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.signature and Bearer secret_api_token_abc123 at C:\\Projects\\kinergy-platform\\secret-config.ts';

      const scrubbed = sandbox.scrubSensitiveDiagnostics(rawLeakedError);

      expect(scrubbed).not.toContain('super_secret_db_pass');
      expect(scrubbed).not.toContain('db.kynergy.internal');
      expect(scrubbed).not.toContain('signature');
      expect(scrubbed).not.toContain('secret_api_token_abc123');
      expect(scrubbed).not.toContain('C:\\Projects\\kinergy-platform');

      expect(scrubbed).toContain('[REDACTED_SECRET]');
      expect(scrubbed).toContain('[REDACTED_JWT]');
      expect(scrubbed).toContain('[REDACTED_PATH]');
    });

    it('executeSafeSubprocess strips application secrets from child process environment', async () => {
      process.env.DATABASE_URL = 'postgres://admin:topsecret@localhost:5432/kynergy';
      process.env.JWT_SECRET = 'ultra-secret-jwt-key-999';

      const checkEnvScript = `
        const hasDb = !!process.env.DATABASE_URL;
        const hasJwt = !!process.env.JWT_SECRET;
        console.log(JSON.stringify({ hasDb, hasJwt }));
      `;

      const result = await sandbox.executeSafeSubprocess(process.execPath, ['-e', checkEnvScript]);

      const parsed = JSON.parse(result.stdout.trim());
      expect(parsed.hasDb).toBe(false);
      expect(parsed.hasJwt).toBe(false);

      delete process.env.DATABASE_URL;
      delete process.env.JWT_SECRET;
    });
  });

  // =========================================================================
  // Scenario 11: Untrusted Output Sanitization
  // =========================================================================
  describe('Scenario 11: Untrusted output sanitization (control characters & script tags)', () => {
    it('strips ASCII control characters, ANSI escape codes, and script tags while preserving UTF-8 text', () => {
      const maliciousExtractedText =
        'Protocolo Clínico\x00\x07 con acentos: á, é, í, ó, ú, ñ\x1B[31mTexto Rojo\x1B[0m y <script>alert("xss")</script> finalizado.';

      const cleaned = sandbox.sanitizeText(maliciousExtractedText);

      expect(cleaned).not.toContain('\x00');
      expect(cleaned).not.toContain('\x07');
      expect(cleaned).not.toContain('\x1B[31m');
      expect(cleaned).not.toContain('<script>');
      expect(cleaned).not.toContain('alert("xss")');

      // Preserves legitimate text and Spanish accents
      expect(cleaned).toContain('Protocolo Clínico');
      expect(cleaned).toContain('á, é, í, ó, ú, ñ');
      expect(cleaned).toContain('Texto Rojo y');
      expect(cleaned).toContain('finalizado.');
    });
  });

  // =========================================================================
  // Scenario 12: Existing Supported-Format Extraction Correctness
  // =========================================================================
  describe('Scenario 12: Existing supported-format extraction remains correct', () => {
    it('extracts valid PDF document correctly via CompositeDocumentParserAdapter', async () => {
      const pdfBuffer = createSinglePagePdf('Evaluacion Kinesiologica');

      const doc = await compositeParser.parse({
        tenantId: 'tenant-1',
        documentId: 'doc-pdf-valid',
        documentVersionId: 'v1',
        format: DocumentFormat.PDF,
        buffer: pdfBuffer,
        originalFileName: 'evaluacion.pdf',
      });

      expect(doc.sourceFormat).toBe(DocumentFormat.PDF);
      expect(doc.blocks.length).toBeGreaterThan(0);
      expect(doc.toFullPlainText()).toContain('Evaluacion Kinesiologica');
    });

    it('extracts valid DOCX document correctly via CompositeDocumentParserAdapter', async () => {
      const docxBuffer = createValidDocx();

      const doc = await compositeParser.parse({
        tenantId: 'tenant-1',
        documentId: 'doc-docx-valid',
        documentVersionId: 'v1',
        format: DocumentFormat.DOCX,
        buffer: docxBuffer,
        originalFileName: 'guia_rehabilitacion.docx',
      });

      expect(doc.sourceFormat).toBe(DocumentFormat.DOCX);
      expect(doc.blocks.length).toBeGreaterThan(0);
      expect(doc.toFullPlainText()).toContain('Manual de Kinesiología');
    });

    it('extracts valid Markdown document correctly via CompositeDocumentParserAdapter', async () => {
      const mdBuffer = Buffer.from(
        '# Guía de Postura\n\nEl paciente debe mantener alineación espinal.\n\n- Punto 1: Espalda recta\n- Punto 2: Pies apoyados',
        'utf8',
      );

      const doc = await compositeParser.parse({
        tenantId: 'tenant-1',
        documentId: 'doc-md-valid',
        documentVersionId: 'v1',
        format: DocumentFormat.MARKDOWN,
        buffer: mdBuffer,
        originalFileName: 'guia_postura.md',
      });

      expect(doc.sourceFormat).toBe(DocumentFormat.MARKDOWN);
      expect(doc.blocks.length).toBeGreaterThanOrEqual(3);
      expect(doc.blocks[0]?.text).toContain('Guía de Postura');
    });

    it('extracts valid Plain Text document correctly via CompositeDocumentParserAdapter', async () => {
      const txtBuffer = Buffer.from(
        'Nota de Evolución Clínica\n\nPaciente responde favorablemente a la terapia manual.',
        'utf8',
      );

      const doc = await compositeParser.parse({
        tenantId: 'tenant-1',
        documentId: 'doc-txt-valid',
        documentVersionId: 'v1',
        format: DocumentFormat.TXT,
        buffer: txtBuffer,
        originalFileName: 'nota_evolucion.txt',
      });

      expect(doc.sourceFormat).toBe(DocumentFormat.TXT);
      expect(doc.blocks.length).toBeGreaterThan(0);
      expect(doc.toFullPlainText()).toContain('Nota de Evolución');
    });
  });
});
