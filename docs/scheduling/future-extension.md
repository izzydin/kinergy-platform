# Scheduling Bounded Context — Future Extension Blueprints

## Executive Summary

This document outlines future architectural expansion blueprints for recurring appointments (RRULE), bi-directional external calendar synchronization (Google Calendar / Microsoft Outlook), and multi-facility location hierarchy expansion.

---

## Table of Contents

- [1. Recurrence Engine Integration (iCalendar RRULE)](#1-recurrence-engine-integration-icalendar-rrule)
- [2. Bi-Directional External Calendar Sync (Google Calendar / Microsoft Outlook)](#2-bi-directional-external-calendar-sync-google-calendar--microsoft-outlook)
- [3. Multi-Location & Facility Hierarchy Expansion](#3-multi-location--facility-hierarchy-expansion)

---

## 1. Recurrence Engine Integration (iCalendar RRULE)

### Architectural Design

To support recurring appointments (e.g., weekly therapy sessions) without exploding database records or breaking aggregate transaction boundaries, the domain leverages **Recurrence Value Objects** and standard iCalendar RRULE strings (`FREQ=WEEKLY;BYDAY=MO;COUNT=10`).

### Domain Integration Blueprint

- `WorkingHours` and `BreakPeriod` VOs in `TherapistSchedule` are pre-structured with `isRecurring` flags and day-of-week recurrence bitmasks.
- A `RecurrenceRule` VO will encapsulate iCalendar RRULE parser logic in domain core.
- The `AvailabilityService` slot search engine expands recurring rules dynamically in-memory over the search window $[T_{start}, T_{end}]$ without persisting unbooked future occurrences.

---

## 2. Bi-Directional External Calendar Sync (Google Calendar / Microsoft Outlook)

### Architectural Design

External calendar synchronization is decoupled from the core scheduling domain using **Domain Events** and **Outbox Pattern**.

```
[Appointment Aggregate] ---> Emits AppointmentCreatedEvent / RescheduledEvent
                                          |
                                          v
                                 [Transactional Outbox]
                                          |
                                          v
                             [External Calendar Adapter]
                                    |            |
                                    v            v
                            (Google Calendar) (Outlook 365)
```

### Inbound Webhook Sync

- Inbound webhooks from Google/Outlook hit infrastructure webhooks adapter.
- Infrastructure translates webhook payloads into application command `SyncExternalCalendarEventCommand`.
- `TherapistSchedule` aggregate applies `AvailabilityOverride` (`UNAVAILABLE`) for external busy events without mutating core booking logic.

---

## 3. Multi-Location & Facility Hierarchy Expansion

### Blueprint

- Aggregate roots currently reference `roomId` as a scalar identifier.
- Multi-location support extends `Room` aggregate or introduces `LocationId` scalar references:
  `Room { id: RoomId, locationId: LocationId, name: string, capacity: number }`
- `BusinessCalendarService` will support facility-level closures scoped by `locationId`.
