# 32. User Account Status State Machine Architecture

- **Status:** Accepted
- **Date:** 2026-07-27

## Context and Problem Statement

In enterprise SaaS systems, managing user account status transitions (`Pending`, `Active`, `Inactive`, `Blocked`) without a centralized state machine leads to scattered status validation logic, bypassable security rules, and unauthorized state jumps (e.g., directly transitioning a `Blocked` malicious user to `Inactive` without administrator unblocking).

## Decision Drivers

- **Domain-Driven Design Encapsulation**: Account status lifecycle logic must reside inside the Identity Domain layer (`UserStatusStateMachine`), strictly preventing scattered condition checks in controllers or HTTP guards.
- **Explicit Transition Rules**: Enforce valid state transitions (`Pending -> Active/Inactive/Blocked`, `Active -> Inactive/Blocked`, `Inactive -> Active/Blocked`, `Blocked -> Active`). Prevent invalid jumps.
- **Strict Authentication Access Control**: Only users in `ACTIVE` status possess authentication privileges. `PENDING`, `INACTIVE`, and `BLOCKED` states are strictly denied authentication.
- **Automatic Token Revocation**: Transitioning a user out of `ACTIVE` status immediately revokes active refresh tokens and increments `tokenVersion` to purge active sessions across devices.

## Decision Outcome

Chosen Option: **Domain Service `UserStatusStateMachine` with `User.transitionTo()` Aggregate Encapsulation**.

### State Machine Transition Diagram

```
                 ┌──────────┐
                 │ PENDING  │
                 └────┬─────┘
                      │ (activate)
                      ▼
 ┌──────────┐   (deactivate)   ┌──────────┐
 │ INACTIVE │ ◄──────────────► │  ACTIVE  │
 └────┬─────┘                  └────┬─────┘
      │ (block)                     │ (block)
      ▼                             ▼
 ┌────────────────────────────────────────┐
 │                BLOCKED                 │
 └───────────────────┬────────────────────┘
                     │ (unblock only)
                     ▼
               ┌──────────┐
               │  ACTIVE  │
               └──────────┘
```

## Consequences

### Positive

- Zero scattered status checking logic across application use cases or transport layers.
- Guaranteed session purge on deactivation or blocking.
- Extensible state machine supporting seamless addition of future domain states (e.g., `MIGRATED`, `ARCHIVED`).
- 100% unit test coverage validating allowed and forbidden status transitions.
