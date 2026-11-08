import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  PaymentCompletedEvent,
  PaymentCancelledEvent,
  PaymentFailedEvent,
  SaleFinalizedEvent,
  SalePaidEvent,
  SaleCancelledEvent,
  ReceiptIssuedEvent,
  ReceiptReprintedEvent,
  SalesEventPublisherPort,
  SaleRepositoryPort,
  SaleSourceType,
  SourceType,
  ActivateOrRenewMembershipHandler,
} from '@kinergy-platform/core';
import {
  AUDIT_EVENT_PUBLISHER,
  IAuditEventPublisher,
  IAuditEvent,
  IAuditEventActor,
  AuditEventCategory,
  AuditOutcome,
  AuditSeverity,
} from '../../platform/audit';
import { REQUEST_CONTEXT_ACCESSOR, IRequestContextAccessor } from '../../platform/identity/context';
import { RequestContext } from '../../platform/identity/request-context';
import { SALE_REPOSITORY_TOKEN } from '../sales.tokens';

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
    @Inject(REQUEST_CONTEXT_ACCESSOR)
    @Optional()
    private readonly contextAccessor?: IRequestContextAccessor,
    @Inject(ActivateOrRenewMembershipHandler)
    @Optional()
    private readonly activateOrRenewHandler?: ActivateOrRenewMembershipHandler,
    @Inject(SALE_REPOSITORY_TOKEN)
    @Optional()
    private readonly saleRepository?: SaleRepositoryPort,
  ) {}

  public async publish(events: SalesDomainEventList): Promise<void> {
    if (this.auditPublisher && events && events.length > 0) {
      for (const event of events) {
        const auditRecord = this.mapDomainEventToAuditEvent(event);
        if (auditRecord) {
          await this.auditPublisher.publish(auditRecord);
        }
      }
    }

    // Post-payment commercial fulfillment orchestration (ADR-0139)
    if (this.activateOrRenewHandler && this.saleRepository && events && events.length > 0) {
      for (const event of events) {
        if (event instanceof SalePaidEvent) {
          try {
            const sale = await this.saleRepository.findById(event.payload.saleId);
            if (sale && sale.clientId) {
              const gymItem = sale.items.find(
                (it) =>
                  String(it.source.sourceType) === String(SaleSourceType.GYM_MEMBERSHIP) ||
                  String(it.source.sourceType) === String(SourceType.MEMBERSHIP_PLAN),
              );
              const isSaleGymSource =
                sale.source &&
                (String(sale.source.sourceType) === String(SaleSourceType.GYM_MEMBERSHIP) ||
                  String(sale.source.sourceType) === String(SourceType.MEMBERSHIP_PLAN));

              const planId = isSaleGymSource ? sale.source.sourceId : gymItem?.source.sourceId;

              if (planId) {
                await this.activateOrRenewHandler.activateOrRenew({
                  clientId: sale.clientId,
                  planId,
                  paymentRef: sale.id.value,
                });
              }
            }
          } catch (fulfillmentErr) {
            console.warn('Membership post-payment fulfillment advisory:', fulfillmentErr);
          }
        }
      }
    }
  }

  private resolveActor(tenantId?: string | null): IAuditEventActor {
    const ctx = this.contextAccessor?.getContext() ?? RequestContext.currentContext();
    return {
      userId: ctx?.userId || undefined,
      email: ctx?.email || undefined,
      roles: ctx?.roles && ctx.roles.length > 0 ? [...ctx.roles] : undefined,
      tenantId: ctx?.tenantId || tenantId || null,
    };
  }

  private mapDomainEventToAuditEvent(event: SalesDomainEvent): IAuditEvent | null {
    const timestamp = (event as { occurredAt?: Date }).occurredAt ?? new Date();

    if (event instanceof PaymentCompletedEvent) {
      return {
        eventId: event.eventId,
        eventType: 'PaymentCompleted',
        category: AuditEventCategory.DATA_ACCESS,
        timestamp,
        actor: this.resolveActor(event.payload.tenantId),
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
        actor: this.resolveActor(event.payload.tenantId),
        target: {
          type: 'Payment',
          id: event.payload.paymentId,
        },
        outcome: AuditOutcome.SUCCESS,
        severity: AuditSeverity.MEDIUM,
        tenantId: event.payload.tenantId,
        metadata: {
          reason: sanitizeReference(event.payload.reason) ?? undefined,
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
        actor: this.resolveActor(event.payload.tenantId),
        target: {
          type: 'Payment',
          id: event.payload.paymentId,
        },
        outcome: AuditOutcome.FAILURE,
        severity: AuditSeverity.HIGH,
        tenantId: event.payload.tenantId,
        metadata: {
          reason: sanitizeReference(event.payload.reason) ?? 'Unknown failure',
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
        actor: this.resolveActor(),
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
        actor: this.resolveActor(),
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

    if (event instanceof ReceiptIssuedEvent) {
      return {
        eventId: event.eventId,
        eventType: 'ReceiptIssued',
        category: AuditEventCategory.DATA_ACCESS,
        timestamp,
        actor: this.resolveActor(event.payload.tenantId),
        target: {
          type: 'Receipt',
          id: event.payload.receiptId,
        },
        outcome: AuditOutcome.SUCCESS,
        severity: AuditSeverity.LOW,
        tenantId: event.payload.tenantId,
        metadata: {
          custom: {
            receiptNumber: event.payload.receiptNumber,
            saleId: event.payload.saleId,
            totalAmount: event.payload.totalAmount,
            cents: event.payload.totalCents,
            currency: event.payload.currency,
            issuedAt: event.payload.issuedAt.toISOString(),
          },
        },
      };
    }

    if (event instanceof ReceiptReprintedEvent) {
      return {
        eventId: event.eventId,
        eventType: 'ReceiptReprinted',
        category: AuditEventCategory.DATA_ACCESS,
        timestamp,
        actor: this.resolveActor(event.payload.tenantId),
        target: {
          type: 'Receipt',
          id: event.payload.receiptId,
        },
        outcome: AuditOutcome.SUCCESS,
        severity: AuditSeverity.LOW,
        tenantId: event.payload.tenantId,
        metadata: {
          custom: {
            receiptNumber: event.payload.receiptNumber,
            saleId: event.payload.saleId,
            reprintCount: event.payload.reprintCount,
            reprintedAt: event.payload.reprintedAt.toISOString(),
          },
        },
      };
    }

    return null;
  }
}
