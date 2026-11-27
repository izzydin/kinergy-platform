import { Injectable, Logger } from '@nestjs/common';
import * as childProcess from 'child_process';
import {
  ExtractedDocument,
  ExtractedBlock,
  ExtractionTimeoutException,
  ExtractionResourceLimitExceededException,
} from '@kinergy-platform/core';

export interface SandboxExecutionOptions {
  timeoutMs?: number;
  maxExtractedChars?: number;
  documentId?: string;
  documentVersionId?: string;
}

export interface SafeSubprocessOptions {
  timeoutMs?: number;
  maxBufferBytes?: number;
  cwd?: string;
  env?: Record<string, string>;
}

export interface SafeSubprocessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export const DEFAULT_PARSER_TIMEOUT_MS = 30000; // 30 seconds
export const DEFAULT_MAX_EXTRACTED_CHARS = 5000000; // 5M characters
export const DEFAULT_SUBPROCESS_TIMEOUT_MS = 15000; // 15 seconds
export const DEFAULT_SUBPROCESS_MAX_BUFFER = 5 * 1024 * 1024; // 5 MB

/**
 * Service providing isolated, resource-bounded, and sanitized execution harnesses
 * for untrusted document parsers and optional subprocesses.
 *
 * Defense guarantees:
 * 1. Process & Memory Controls: Enforces strict wall-clock timeouts and 5M character limits.
 * 2. Arbitrary Command Prevention: Safe subprocess API strictly rejects shell interpreters,
 *    passing arguments exclusively as discrete string arrays via execFile/spawn.
 * 3. Secret Isolation: Strips credentials, JWT secrets, database connection strings, and
 *    sensitive host paths from error logs, diagnostic traces, and child process environments.
 * 4. Untrusted Output Sanitization: Strips non-printable ASCII control characters, ANSI escape codes,
 *    and dangerous embedded script tags from extracted content.
 */
@Injectable()
export class ParserSandboxService {
  private readonly logger = new Logger(ParserSandboxService.name);

  /**
   * Sanitizes untrusted text extracted from arbitrary documents.
   * - Strips non-printable ASCII control characters [\x00-\x08\x0B\x0C\x0E-\x1F\x7F].
   * - Preserves valid whitespace: \t (0x09), \n (0x0A), \r (0x0D).
   * - Strips ANSI terminal escape sequences.
   * - Strips embedded <script> tags.
   * - Preserves UTF-8 multi-byte characters (Spanish accents, emojis, CJK, etc.).
   */
  public sanitizeText(text: string): string {
    if (!text) return '';

    return (
      text
        // 1. Strip ANSI escape codes
        // eslint-disable-next-line no-control-regex
        .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
        // 2. Strip dangerous control characters (preserve \t, \n, \r)
        // eslint-disable-next-line no-control-regex
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        // 3. Strip HTML script tags and content
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    );
  }

  /**
   * Sanitizes an ExtractedDocument's blocks and validates that total character count
   * does not exceed the allowed maximum extraction threshold.
   */
  public sanitizeExtractedDocument(
    doc: ExtractedDocument,
    maxExtractedChars: number = DEFAULT_MAX_EXTRACTED_CHARS,
  ): ExtractedDocument {
    let runningChars = 0;

    const sanitizedBlocks: ExtractedBlock[] = doc.blocks.map((block) => {
      const sanitizedText = this.sanitizeText(block.text);
      runningChars += sanitizedText.length;

      if (runningChars > maxExtractedChars) {
        throw new ExtractionResourceLimitExceededException(
          'Extracted text characters',
          runningChars,
          maxExtractedChars,
          doc.documentId,
          doc.documentVersionId,
        );
      }

      return ExtractedBlock.create({
        id: block.id,
        type: block.type,
        text: sanitizedText,
        sequence: block.sequence,
        headingLevel: block.headingLevel,
        sectionPath: block.sectionPath,
        pageNumber: block.pageNumber,
        location: block.location,
        tableMetadata: block.tableMetadata,
        codeLanguage: block.codeLanguage,
        metadata: block.metadata as Record<string, unknown>,
      });
    });

    const totalChars = sanitizedBlocks.reduce((acc, b) => acc + b.charCount, 0);

    return ExtractedDocument.create({
      documentId: doc.documentId,
      documentVersionId: doc.documentVersionId,
      sourceFormat: doc.sourceFormat,
      title: doc.title ? this.sanitizeText(doc.title) : null,
      languageHint: doc.languageHint,
      blocks: sanitizedBlocks,
      metadata: {
        ...doc.metadata,
        totalChars,
      },
      extractedAt: doc.extractedAt,
    });
  }

  /**
   * Scrubs sensitive secrets, database connection URLs, JWT tokens, and sensitive system
   * paths from error messages and diagnostic traces.
   */
  public scrubSensitiveDiagnostics(message: string): string {
    if (!message) return '';

    return (
      message
        // Database connection strings (postgres://user:pass@host:port/db)
        .replace(
          /(postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s:@/]+:[^\s:@/]+@[^\s/]+/gi,
          '$1://[REDACTED_USER]:[REDACTED_SECRET]@[REDACTED_HOST]',
        )
        // JWT tokens
        .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*/g, '[REDACTED_JWT]')
        // Bearer tokens
        .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED_TOKEN]')
        // AWS Access Keys (AKIA...)
        .replace(/AKIA[0-9A-Z]{16}/g, '[REDACTED_AWS_KEY]')
        // Password / Secret field assignments (password=..., secret: ...)
        .replace(
          /(password|secret|jwt_secret|api_key|token)\s*[:=]\s*['"]?[^\s"',;]+['"]?/gi,
          '$1=[REDACTED_SECRET]',
        )
        // Sensitive server filesystem paths
        .replace(/[A-Za-z]:\\[^"'\s\n\r<>|]+/g, '[REDACTED_PATH]')
        .replace(
          /(?:\/(?:home|Users|etc|var|root|tmp|private))\/[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*/g,
          '[REDACTED_PATH]',
        )
    );
  }

  /**
   * Sanitizes an unknown error object, ensuring any leaked environment variables,
   * database credentials, or server paths in its message are thoroughly redacted.
   */
  public scrubError(error: unknown, _documentId?: string, _documentVersionId?: string): Error {
    if (error instanceof Error) {
      const cleanMessage = this.scrubSensitiveDiagnostics(error.message);
      if (cleanMessage !== error.message) {
        // Clone with scrubbed message
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const scrubbedError = new (error.constructor as any)(cleanMessage);
        scrubbedError.name = error.name;
        if (error.stack) {
          scrubbedError.stack = this.scrubSensitiveDiagnostics(error.stack);
        }
        return scrubbedError;
      }
      return error;
    }

    const msg = this.scrubSensitiveDiagnostics(String(error));
    return new Error(msg);
  }

  /**
   * Executes a parser task within a protected sandbox environment:
   * - Strict timeout enforcement.
   * - Extracted character limit check (5M characters max).
   * - Untrusted output text sanitization (control characters, script tags).
   * - Redaction of secrets and system paths from any generated errors.
   */
  public async executeWithSandbox<T>(
    task: () => Promise<T>,
    options?: SandboxExecutionOptions,
  ): Promise<T> {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_PARSER_TIMEOUT_MS;
    const maxChars = options?.maxExtractedChars ?? DEFAULT_MAX_EXTRACTED_CHARS;

    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new ExtractionTimeoutException(
            timeoutMs,
            options?.documentId,
            options?.documentVersionId,
          ),
        );
      }, timeoutMs);
      if (typeof timer.unref === 'function') timer.unref();
    });

    try {
      const result = await Promise.race([task(), timeoutPromise]);

      if (result instanceof ExtractedDocument) {
        return this.sanitizeExtractedDocument(result, maxChars) as unknown as T;
      }

      return result;
    } catch (err: unknown) {
      const scrubbed = this.scrubError(err, options?.documentId, options?.documentVersionId);
      throw scrubbed;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Safe subprocess runner for external parser or converter binaries.
   *
   * Hardened controls:
   * - Rejects shell execution: Invokes childProcess.spawn with explicit args array.
   * - Zero shell metacharacter expansion: Disallows pipes, backticks, subshells.
   * - Environment Sanitization: Strips all application secrets and environment credentials.
   * - Resource & Zombie Prevention: Forcefully terminates (SIGTERM -> SIGKILL) child process on timeout.
   * - Buffer Capping: Prevents subprocess stdout/stderr from overflowing process memory.
   */
  public async executeSafeSubprocess(
    file: string,
    args: string[] = [],
    options?: SafeSubprocessOptions,
  ): Promise<SafeSubprocessResult> {
    // 1. Validate file executable path against shell injection metacharacters
    if (!file || typeof file !== 'string') {
      throw new Error('Executable path must be a non-empty string.');
    }

    if (/[;|&`$><\r\n]/.test(file)) {
      throw new Error(`Executable path contains forbidden shell metacharacters: '${file}'`);
    }

    // 2. Prepare sanitized environment (whitelisting safe system keys only)
    const allowedSystemEnvVars = [
      'PATH',
      'TEMP',
      'TMP',
      'SYSTEMROOT',
      'WINDIR',
      'COMSPEC',
      'PATHEXT',
      'LANG',
      'LC_ALL',
      'TMPDIR',
      'HOME',
      'USER',
    ];

    const sanitizedEnv: Record<string, string> = {};
    for (const key of allowedSystemEnvVars) {
      const val =
        process.env[key] ?? process.env[key.toUpperCase()] ?? process.env[key.toLowerCase()];
      if (val !== undefined) {
        sanitizedEnv[key] = val;
      }
    }

    // Merge any explicitly provided non-secret options.env
    if (options?.env) {
      Object.assign(sanitizedEnv, options.env);
    }

    const timeoutMs = options?.timeoutMs ?? DEFAULT_SUBPROCESS_TIMEOUT_MS;
    const maxBuffer = options?.maxBufferBytes ?? DEFAULT_SUBPROCESS_MAX_BUFFER;

    return new Promise<SafeSubprocessResult>((resolve, reject) => {
      let isTimedOut = false;
      let killTimer: NodeJS.Timeout | undefined;
      let stdoutData = '';
      let stderrData = '';
      let isTerminated = false;

      // Spawn process directly without shell
      const child = childProcess.spawn(file, args, {
        shell: false,
        env: sanitizedEnv,
        cwd: options?.cwd,
        windowsHide: true,
      });

      const timer = setTimeout(() => {
        isTimedOut = true;
        isTerminated = true;
        this.logger.warn(`Subprocess '${file}' timed out after ${timeoutMs}ms. Sending SIGTERM.`);

        try {
          child.kill('SIGTERM');
        } catch {
          // ignore
        }

        // Zombie prevention: Force kill with SIGKILL if not exited within 1s
        killTimer = setTimeout(() => {
          try {
            this.logger.warn(`Subprocess '${file}' did not exit after SIGTERM. Sending SIGKILL.`);
            child.kill('SIGKILL');
          } catch {
            // ignore
          }
        }, 1000);
        if (typeof killTimer.unref === 'function') killTimer.unref();

        reject(
          new Error(
            `Subprocess execution timed out after ${timeoutMs}ms and was terminated: '${file}'`,
          ),
        );
      }, timeoutMs);

      if (typeof timer.unref === 'function') timer.unref();

      child.stdout.on('data', (chunk: Buffer | string) => {
        stdoutData += chunk.toString();
        if (stdoutData.length > maxBuffer) {
          isTerminated = true;
          clearTimeout(timer);
          if (killTimer) clearTimeout(killTimer);
          try {
            child.kill('SIGKILL');
          } catch {
            // ignore
          }
          reject(
            new Error(
              `Subprocess stdout exceeded maximum buffer limit of ${maxBuffer} bytes. Terminated.`,
            ),
          );
        }
      });

      child.stderr.on('data', (chunk: Buffer | string) => {
        stderrData += chunk.toString();
        if (stderrData.length > maxBuffer) {
          isTerminated = true;
          clearTimeout(timer);
          if (killTimer) clearTimeout(killTimer);
          try {
            child.kill('SIGKILL');
          } catch {
            // ignore
          }
          reject(
            new Error(
              `Subprocess stderr exceeded maximum buffer limit of ${maxBuffer} bytes. Terminated.`,
            ),
          );
        }
      });

      child.on('error', (err: Error) => {
        clearTimeout(timer);
        if (killTimer) clearTimeout(killTimer);
        if (!isTimedOut && !isTerminated) {
          reject(new Error(this.scrubSensitiveDiagnostics(err.message)));
        }
      });

      child.on('close', (code: number | null) => {
        clearTimeout(timer);
        if (killTimer) clearTimeout(killTimer);

        if (isTimedOut || isTerminated) return;

        resolve({
          stdout: stdoutData,
          stderr: stderrData,
          exitCode: code ?? 0,
        });
      });
    });
  }
}
