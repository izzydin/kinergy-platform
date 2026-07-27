# 22. Dedicated Token Configuration Abstraction

- **Status:** Accepted
- **Date:** 2026-07-27

## Context and Problem Statement

Previously, authentication use cases (`LoginUseCase`, `RefreshTokenUseCase`) contained hardcoded expiration durations (`7 * 24 * 60 * 60 * 1000` ms for refresh tokens and `900` seconds for access tokens). Business logic should never own infrastructure configuration or hardcoded policy literals.

## Decision Drivers

- **Zero Hardcoded Policy Literals**: Expiration durations, clock skew, issuer, and audience must be supplied via dependency injection.
- **Clean Architecture & Dependency Inversion**: Use cases depend on `ITokenConfiguration` (`TOKEN_CONFIGURATION`), preventing `ConfigService` or environment framework leakage into the application layer.
- **Future Extensibility**: The policy model (`TokenPolicy`) supports dynamic overrides for enterprise tenant policies, mobile client profiles, temporary access tokens, or API keys without altering application business logic.

## Decision Outcome

Chosen Option: **`ITokenConfiguration` Application Port Interface & `ConfigTokenConfiguration` Infrastructure Provider**.

```
ConfigService / Environment Variables
                │
                ▼
      ConfigTokenConfiguration (Infrastructure)
                │
                ▼ implements ITokenConfiguration
   ┌──────────────────────────┐
   │ LoginUseCase             │
   │ RefreshTokenUseCase      │ (Application Layer)
   └──────────────────────────┘
```

## Consequences

### Positive

- Complete removal of hardcoded TTL numbers and duration calculations from all authentication use cases.
- Centralized, flexible duration parsing (`parseDurationToSeconds`) supporting `'15m'`, `'7d'`, `'1h'`, `'900'`.
- Clean Architecture principles strictly preserved.
