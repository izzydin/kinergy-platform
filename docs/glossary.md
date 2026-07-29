# Platform Glossary & Terminology Index

- **Status:** Active
- **Scope:** Technical, Architectural, Security, and Sustainability Domain Terms

---

## Technical & Architectural Acronyms

| Term / Acronym | Definition                                                                                                                               |
| :------------- | :--------------------------------------------------------------------------------------------------------------------------------------- |
| **ADR**        | **Architecture Decision Record**: A document capturing an important architectural decision made along with its context and consequences. |
| **ASVS**       | **Application Security Verification Standard**: OWASP framework for defining software security requirements and controls.                |
| **C4 Model**   | Context, Containers, Components, and Code: Architectural abstraction hierarchy for software visualization.                               |
| **CSP**        | **Content Security Policy**: HTTP header restricting sources of content browser script execution to prevent XSS.                         |
| **CSPRNG**     | **Cryptographically Secure Pseudo-Random Number Generator**: Randomness source suitable for cryptographic keys and temporary tokens.     |
| **DDD**        | **Domain-Driven Design**: Software design approach focusing on core domain logic, bounded contexts, and ubiquitous language.             |
| **DIP**        | **Dependency Inversion Principle**: Clean Architecture rule stating high-level modules must depend on abstractions, not details.         |
| **HSTS**       | **HTTP Strict Transport Security**: Web security policy mechanism enforcing HTTPS connections.                                           |
| **JWT**        | **JSON Web Token**: Open standard (RFC 7519) compact URL-safe token format for security claim assertion.                                 |
| **MADR**       | **Markdown Architectural Decision Records**: Standardized format for lightweight markdown decision records.                              |
| **OWASP**      | **Open Web Application Security Project**: Non-profit foundation working to improve software security.                                   |
| **RBAC**       | **Role-Based Access Control**: Security access control model assigning permissions to roles rather than individual users.                |
| **RTR**        | **Refresh Token Rotation**: Security pattern where issuing a new access token invalidates the used refresh token and returns a new pair. |
| **SIEM**       | **Security Information and Event Management**: System collecting and analyzing security event telemetry across infrastructure.           |
| **XSS**        | **Cross-Site Scripting**: Security vulnerability allowing attackers to inject malicious scripts into web responses.                      |

---

## Domain & Platform Terminology

| Term                         | Domain Context      | Definition                                                                                                          |
| :--------------------------- | :------------------ | :------------------------------------------------------------------------------------------------------------------ |
| **Aggregate Root**           | DDD Kernel          | The root domain entity (`User`) encapsulating internal domain objects and enforcing transactional invariants.       |
| **Bounded Context**          | DDD Architecture    | Explicit boundary within which a domain model applies (`platform/identity`, `sustainability`).                      |
| **Dummy Argon2id Execution** | Security            | Constant-time execution of Argon2id password hashing on missing users to prevent timing attack account enumeration. |
| **Input Sanitizer**          | Validation          | Global security component stripping control bytes, trimming whitespace, and neutralizing XSS payloads.              |
| **Modular Monolith**         | System Architecture | Architectural pattern organizing code into distinct, decoupled bounded contexts within a single deployment unit.    |
| **Security Event Hook**      | Platform Security   | Reusable event adapter mapping domain security events into normalized audit event records.                          |
| **Token Family**             | Identity            | Grouping of refresh tokens issued sequentially in a single session to detect and mitigate token replay attacks.     |
