# 34. Enterprise Testing Strategy and Standards

- **Status:** Accepted
- **Date:** 2026-07-27

## Context and Problem Statement

For full enterprise testing standards, Test Pyramid definition, coverage expectations, naming conventions, factory patterns, mocking philosophy, and forbidden anti-patterns across all monorepo bounded contexts, refer to the master testing ADR document:

👉 **[Master Testing Strategy & Standards Document](file:///c:/Projects/kinergy-platform/docs/adr/testing/testing-strategy.md)**

## Summary of Decisions

1. **Test Pyramid**: ~70-80% unit tests, ~15-20% integration tests, ~5-10% E2E tests.
2. **Mandatory Testing Package**: All bounded contexts must consume `@kinergy-platform/testing`.
3. **No `/auth/login` in Setup**: Auth headers must be constructed containerlessly via `JwtTestFactory` & `SecurityContextTestMock`.
4. **Risk-Based Coverage**: 100% mandatory coverage for Domain aggregates/state machines and Security Guards.
5. **Mock Infrastructure Only**: Never mock domain rules or aggregate entities.
