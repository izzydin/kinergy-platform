# 35. Global Validation & Input Sanitization Pipeline

- **Status:** Accepted
- **Date:** 2026-07-27
- **Context:** Security & Quality Architecture Baseline

---

## 1. Context & Problem Statement

Every HTTP API request entering the Kynergy platform represents an external input surface. Without automated, global validation and input sanitization:

- Controller methods must manually invoke validation routines, leading to code duplication and missing security checks.
- Malformed payloads or extra unwhitelisted properties can leak into application use cases or Prisma repositories.
- Cross-Site Scripting (XSS) script tags, invisible control characters (`\u0000`), and excessive whitespace can pollute persistent storage or corrupt search indices.

---

## 2. Decision Outcome

We decision to establish **`GlobalSanitizationValidationPipe`** as the default, automatic validation and input sanitization pipe across all HTTP request endpoints in the Kynergy monorepo platform.

### Key Implementation Principles

1. **Centralized Input Sanitization (`InputSanitizer`)**:
   - Executes recursively across all incoming JSON bodies, URL params, and query strings.
   - Trims leading and trailing whitespace.
   - Strips ASCII control characters (`\u0000-\u001F`, `\u007F-\u009F`).
   - Neutralizes common XSS vectors (`<script>`, `javascript:`, event handlers like `onload=`).
   - Exempts password and secret credential fields from HTML entity modifications to maintain exact cryptographic hash equality.

2. **Strict ValidationPipe Configurations**:
   - `whitelist: true`: Automatically strips properties that do not have explicit `class-validator` decorators.
   - `forbidNonWhitelisted: true`: Immediately rejects payloads with unallowed extra properties with `400 Bad Request` (`BadRequestException`).
   - `transform: true`: Transforms raw plain JSON objects into typed DTO class instances.
   - `transformOptions: { enableImplicitConversion: true }`: Enables implicit primitive type conversion for query string parameters.

3. **Global NestJS Provider Registration**:
   - Registered globally via `APP_PIPE` in `AppModule` and `app.useGlobalPipes()` in `bootstrap()`.
   - Every future bounded context module (`Clients`, `Employees`, `Scheduling`, `Billing`) automatically inherits global validation and input sanitization without requiring custom decorator boilerplate.

---

## 3. Architecture Benefits & Consequences

### Benefits

- **Zero Duplication**: Application use cases and domain entities operate strictly on pre-validated, pre-sanitized inputs.
- **Defense in Depth**: Rejects malicious payloads at the transport boundary before executing database queries or business state transitions.
- **Developer Productivity**: New endpoint authoring requires only standard `class-validator` annotations on DTOs.

### Consequences

- Request payloads containing non-whitelisted fields will be rejected with HTTP 400. DTO schemas must accurately reflect all allowed endpoint properties.
