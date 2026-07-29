# Architectural Decision Records (ADR)

This directory contains records of key architectural and technical decisions made for the **Kinergy Platform**.

## Index of Decisions

| ID                                                                                                                        | Title                                                                           | Status   | Date       |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------- | ---------- |
| [0001](file:///c:/Projects/kinergy-platform/docs/adr/0001-record-architecture-decisions.md)                               | Record Architecture Decisions                                                   | Accepted | 2026-07-24 |
| [0002](file:///c:/Projects/kinergy-platform/docs/adr/0002-nx-monorepo-clean-architecture-ddd.md)                          | Nx Monorepo Architecture with Clean Architecture and Domain-Driven Design       | Accepted | 2026-07-24 |
| [0003](file:///c:/Projects/kinergy-platform/docs/adr/0003-nx-integrated-workspace-pnpm.md)                                | Nx Integrated Workspace Setup with pnpm                                         | Accepted | 2026-07-24 |
| [0004](file:///c:/Projects/kinergy-platform/docs/adr/0004-workspace-development-tooling.md)                               | Workspace Development Tooling Setup                                             | Accepted | 2026-07-24 |
| [0005](file:///c:/Projects/kinergy-platform/docs/adr/0005-ci-cd-github-actions-workflow.md)                               | CI/CD GitHub Actions Workflow                                                   | Accepted | 2026-07-24 |
| [0006](file:///c:/Projects/kinergy-platform/docs/adr/0006-docker-local-development-infrastructure.md)                     | Docker Infrastructure for Local Development                                     | Accepted | 2026-07-24 |
| [0007](file:///c:/Projects/kinergy-platform/docs/adr/0007-nestjs-application-scaffolding.md)                              | NestJS Application Scaffolding in `apps/api`                                    | Accepted | 2026-07-24 |
| [0008](file:///c:/Projects/kinergy-platform/docs/adr/0008-react-vite-web-application-scaffolding.md)                      | React + Vite Application Scaffolding in `apps/web`                              | Accepted | 2026-07-24 |
| [0009](file:///c:/Projects/kinergy-platform/docs/adr/0009-shared-workspace-packages.md)                                   | Shared Workspace Packages in `packages/`                                        | Accepted | 2026-07-24 |
| [0010](file:///c:/Projects/kinergy-platform/docs/adr/0010-backend-clean-architecture-layering.md)                         | Backend Clean Architecture & Layering Structure in `apps/api`                   | Accepted | 2026-07-24 |
| [0011](file:///c:/Projects/kinergy-platform/docs/adr/0011-prisma-orm-persistence-infrastructure.md)                       | Prisma ORM Persistence Infrastructure Setup                                     | Accepted | 2026-07-24 |
| [0012](file:///c:/Projects/kinergy-platform/docs/adr/0012-shared-domain-kernel-abstractions.md)                           | Shared Domain Kernel Abstractions                                               | Accepted | 2026-07-24 |
| [0013](file:///c:/Projects/kinergy-platform/docs/adr/0013-enterprise-platform-services-infrastructure.md)                 | Enterprise Platform Services Infrastructure                                     | Accepted | 2026-07-24 |
| [0014](file:///c:/Projects/kinergy-platform/docs/adr/0014-zod-validated-application-configuration.md)                     | Zod-Validated Application Configuration                                         | Accepted | 2026-07-24 |
| [0015](file:///c:/Projects/kinergy-platform/docs/adr/0015-architecture-documentation-and-diagrams.md)                     | Architecture Documentation and Visual Diagrams Setup                            | Accepted | 2026-07-24 |
| [0016](file:///c:/Projects/kinergy-platform/docs/adr/0016-technical-quality-gate-baseline.md)                             | Technical Quality Gate Baseline                                                 | Accepted | 2026-07-24 |
| [0017](file:///c:/Projects/kinergy-platform/docs/adr/0017-password-infrastructure-argon2id.md)                            | Password Hashing Infrastructure Argon2id                                        | Accepted | 2026-07-24 |
| [0018](file:///c:/Projects/kinergy-platform/docs/adr/0018-jwt-token-infrastructure.md)                                    | JWT Token Infrastructure                                                        | Accepted | 2026-07-24 |
| [0019](file:///c:/Projects/kinergy-platform/docs/adr/0019-refresh-token-persistence-strategy.md)                          | Refresh Token Persistence & Security Strategy                                   | Accepted | 2026-07-27 |
| [0020](file:///c:/Projects/kinergy-platform/docs/adr/0020-production-security-configuration-hardening.md)                 | Production Security Configuration Hardening                                     | Accepted | 2026-07-27 |
| [0021](file:///c:/Projects/kinergy-platform/docs/adr/0021-transactional-consistency-unit-of-work.md)                      | Transactional Consistency & Unit of Work Pattern                                | Accepted | 2026-07-27 |
| [0022](file:///c:/Projects/kinergy-platform/docs/adr/0022-token-configuration-policy-abstraction.md)                      | Dedicated Token Configuration Abstraction                                       | Accepted | 2026-07-27 |
| [0023](file:///c:/Projects/kinergy-platform/docs/adr/0023-extensible-security-event-infrastructure.md)                    | Extensible Security Event Infrastructure                                        | Accepted | 2026-07-27 |
| [0024](file:///c:/Projects/kinergy-platform/docs/adr/0024-authentication-guard-architecture.md)                           | Reusable Authentication Guard Architecture                                      | Accepted | 2026-07-27 |
| [0025](file:///c:/Projects/kinergy-platform/docs/adr/0025-role-and-permission-authorization-framework.md)                 | Extensible Role and Permission Authorization Framework                          | Accepted | 2026-07-27 |
| [0026](file:///c:/Projects/kinergy-platform/docs/adr/0026-reusable-security-decorators-architecture.md)                   | Reusable Security Decorators Architecture                                       | Accepted | 2026-07-27 |
| [0027](file:///c:/Projects/kinergy-platform/docs/adr/0027-authenticated-request-context-architecture.md)                  | Authenticated Request Context Architecture                                      | Accepted | 2026-07-27 |
| [0028](file:///c:/Projects/kinergy-platform/docs/adr/0028-extracted-authorization-decision-engine.md)                     | Extracted Authorization Decision Engine (AuthorizationEvaluator)                | Accepted | 2026-07-27 |
| [0029](file:///c:/Projects/kinergy-platform/docs/adr/0029-transport-rate-limiting-architecture.md)                        | Transport Rate Limiting Architecture                                            | Accepted | 2026-07-27 |
| [0030](file:///c:/Projects/kinergy-platform/docs/adr/0030-user-administration-identity-boundary-architecture.md)          | User Administration & Identity Boundary Architecture                            | Accepted | 2026-07-27 |
| [0031](file:///c:/Projects/kinergy-platform/docs/adr/0031-secure-password-lifecycle-management.md)                        | Secure Password Lifecycle Management Architecture                               | Accepted | 2026-07-27 |
| [0032](file:///c:/Projects/kinergy-platform/docs/adr/0032-user-account-status-state-machine-architecture.md)              | User Account Status State Machine Architecture                                  | Accepted | 2026-07-27 |
| [0033](file:///c:/Projects/kinergy-platform/docs/adr/0033-reusable-testing-platform-package-architecture.md)              | Reusable Testing Platform Package Architecture                                  | Accepted | 2026-07-27 |
| [0034](file:///c:/Projects/kinergy-platform/docs/adr/0034-enterprise-testing-strategy-and-standards.md)                   | Enterprise Testing Strategy & Standards                                         | Accepted | 2026-07-27 |
| [0035](file:///c:/Projects/kinergy-platform/docs/adr/0035-global-validation-and-input-sanitization-pipeline.md)           | Global Validation & Input Sanitization Pipeline                                 | Accepted | 2026-07-27 |
| [0036](file:///c:/Projects/kinergy-platform/docs/adr/0036-hardened-password-infrastructure-and-owasp-alignment.md)        | Hardened Password Infrastructure, Centralized Policy & OWASP Alignment          | Accepted | 2026-07-29 |
| [0037](file:///c:/Projects/kinergy-platform/docs/adr/0037-secure-http-defaults-cors-and-helmet-infrastructure.md)         | Secure HTTP Defaults, Production Helmet & Multi-Tenant CORS Infrastructure      | Accepted | 2026-07-29 |
| [0038](file:///c:/Projects/kinergy-platform/docs/adr/0038-authentication-hardening-and-generic-error-handling.md)         | Authentication Hardening, Information Disclosure Prevention & Secret Validation | Accepted | 2026-07-29 |
| [0039](file:///c:/Projects/kinergy-platform/docs/adr/0039-reusable-audit-logging-event-infrastructure.md)                 | Reusable Audit Logging Event Infrastructure Architecture                        | Accepted | 2026-07-29 |
| [security/distributed-rate-limiting](file:///c:/Projects/kinergy-platform/docs/adr/security/distributed-rate-limiting.md) | Intentional In-Memory Rate Limiting for Single-Instance Deployment              | Accepted | 2026-07-29 |

## Format

ADRs in this repository follow the Lightweight Architectural Decision Records (MADR) format.
When making a new architectural decision, copy `0001-record-architecture-decisions.md` format, create `docs/adr/NNNN-title-in-kebab-case.md`, update status, and add an entry to the index table above.
