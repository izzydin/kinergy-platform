import { ApplicationResult } from '../shared/application-result';

export interface CreateKinesiologySessionSaleRequest {
  readonly sessionId: string;
  readonly clientId: string;
  readonly therapistId: string;
  readonly appointmentId?: string;
  readonly unitPriceAmount: number;
  readonly currency: string;
  readonly tenantId?: string;
  readonly idempotencyKey?: string;
  readonly description?: string;
}

export interface KinesiologySaleResult {
  readonly saleId: string;
  readonly totalAmount: number;
  readonly currency: string;
  readonly status: string;
}

/**
 * Outbound port for creating commercial transactions in the Sales domain from Kinesiology.
 * Adheres to Hexagonal Architecture: Kinesiology Application layer depends on this abstraction.
 */
export interface IKinesiologySalesGatewayPort {
  createSale(
    request: CreateKinesiologySessionSaleRequest,
  ): Promise<ApplicationResult<KinesiologySaleResult>>;
}
