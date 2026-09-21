import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  PaymentSettledEvent,
  PaymentCancelledEvent,
  PaymentFailedEvent,
  SaleFinalizedEvent,
  SaleCancelledEvent,
  SalesEventPublisherPort,
} from '@kinergy-platform/core';
import {
  AUDIT_EVENT_PUBLISHER,
  IAuditEventPublisher,
  IAuditEvent,
  AuditEventCategory,
  AuditOutcome,
  AuditSeverity,
} from '../../platform/audit';

type SalesDomainEventList = Parameters<SalesEventPublisherPort['publish']>[0];
type SalesDomainEvent = SalesDomainEventList[number];

/**
 * Sensitive data sanitizer ensuring no cardholder PANs or tokens are logged.
 */
function sanitizeReference(ref?: string | null): string | null {
  if (!ref) {
    return null;
  }
  // Mask potential digit sequences >= 12 characters
  return ref.replace(/\b(?:\d[ -]*?){12,19}\b/g, '****-****-****-[MASKED]');
}

/**
 * Bridges Sales & Payment Domain Events to Centralized Audit Subsystem.
 * Guarantees durable audit tracking for all financial commitments (ADR-0111).
 */
@Injectable()
export class SalesAuditEventPublisher implements SalesEventPublisherPort {
  constructor(
    @Inject(AUDIT_EVENT_PUBLISHER)
    @Optional()
    private readonly auditPublisher?: IAuditEventPublisher,
  ) {}

  public async publish(events: SalesDomainEventList): Promise<void> {
    if (!this.auditPublisher || !events || events.length === 0) {
      return;
    }

    for (const event of events) {
      const auditRecord = this.mapDomainEventToAuditEvent(event);
      if (auditRecord) {
        await this.auditPublisher.publish(auditRecord);
      }
    }
  }

  private mapDomainEventToAuditEvent(event: SalesDomainEvent): IAuditEvent | null {
    const timestamp = (event as { occurredAt?: Date }).occurredAt ?? new Date();

    if (event instanceof PaymentSettledEvent) {
      return {
        eventId: event.eventId,
        eventType: 'PaymentSettled',
        category: AuditEventCategory.DATA_ACCESS,
        timestamp,
        actor: {
          tenantId: event.payload.tenantId,
        },
        target: {
          type: 'Payment',
          id: event.payload.paymentId,
        },
        outcome: AuditOutcome.SUCCESS,
        severity: AuditSeverity.LOW,
        tenantId: event.payload.tenantId,
        metadata: {
          custom: {
            saleId: event.payload.saleId,
            method: event.payload.method,
            amount: event.payload.amount,
            cents: event.payload.cents,
            currency: event.payload.currency,
            reference: sanitizeReference(event.payload.reference),
            paidAt: event.payload.paidAt ? event.payload.paidAt.toISOString() : undefined,
          },
        },
      };
    }

    if (event instanceof PaymentCancelledEvent) {
      return {
        eventId: event.eventId,
        eventType: 'PaymentCancelled',
        category: AuditEventCategory.DATA_ACCESS,
        timestamp,
        actor: {
          tenantId: event.payload.tenantId,
        },
        target: {
          type: 'Payment',
          id: event.payload.paymentId,
        },
        outcome: AuditOutcome.SUCCESS,
        severity: AuditSeverity.MEDIUM,
        tenantId: event.payload.tenantId,
        metadata: {
          reason: event.payload.reason ?? undefined,
          custom: {
            saleId: event.payload.saleId,
          },
        },
      };
    }

    if (event instanceof PaymentFailedEvent) {
      return {
        eventId: event.eventId,
        eventType: 'PaymentFailed',
        category: AuditEventCategory.SYSTEM_SECURITY,
        timestamp,
        actor: {
          tenantId: event.payload.tenantId,
        },
        target: {
          type: 'Payment',
          id: event.payload.paymentId,
        },
        outcome: AuditOutcome.FAILURE,
        severity: AuditSeverity.HIGH,
        tenantId: event.payload.tenantId,
        metadata: {
          reason: event.payload.reason,
          custom: {
            saleId: event.payload.saleId,
            amount: event.payload.amount,
            currency: event.payload.currency,
          },
        },
      };
    }

    if (event instanceof SaleFinalizedEvent) {
      return {
        eventId: event.eventId,
        eventType: 'SaleFinalized',
        category: AuditEventCategory.DATA_ACCESS,
        timestamp,
        actor: {},
        target: {
          type: 'Sale',
          id: event.payload.saleId,
        },
        outcome: AuditOutcome.SUCCESS,
        severity: AuditSeverity.LOW,
        metadata: {
          custom: {
            totalAmount: event.payload.totalAmount,
            currency: event.payload.currency,
            itemCount: event.payload.itemCount,
          },
        },
      };
    }

    if (event instanceof SaleCancelledEvent) {
      return {
        eventId: event.eventId,
        eventType: 'SaleCancelled',
        category: AuditEventCategory.DATA_ACCESS,
        timestamp,
        actor: {},
        target: {
          type: 'Sale',
          id: event.payload.saleId,
        },
        outcome: AuditOutcome.SUCCESS,
        severity: AuditSeverity.MEDIUM,
        metadata: {
          reason: event.payload.reason ?? undefined,
        },
      };
    }

    return null;
  }
}
