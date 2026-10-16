import {
  IKinesiologySalesGatewayPort,
  CreateKinesiologySessionSaleRequest,
  KinesiologySaleResult,
} from '../../application/ports/kinesiology-sales-gateway.port';
import { ApplicationResult } from '../../application/shared/application-result';
import { CreateSaleHandler } from '../../../sales/application/handlers/create-sale.handler';
import { CreateSaleCommand } from '../../../sales/application/commands/create-sale.command';
import { SaleSourceType } from '../../../sales/domain/enums/sale-source-type.enum';

/**
 * Infrastructure Anti-Corruption Layer Adapter implementing IKinesiologySalesGatewayPort.
 * Translates Kinesiology sale requests into the canonical Sales CreateSaleCommand.
 * Adheres strictly to ADR-0110, ADR-0121, and ADR-0139.
 */
export class KinesiologySalesGatewayAdapter implements IKinesiologySalesGatewayPort {
  constructor(private readonly createSaleHandler: CreateSaleHandler) {}

  public async createSale(
    request: CreateKinesiologySessionSaleRequest,
  ): Promise<ApplicationResult<KinesiologySaleResult>> {
    try {
      const command = new CreateSaleCommand({
        idempotencyKey: request.idempotencyKey,
        tenantId: request.tenantId,
        clientId: request.clientId,
        currency: request.currency,
        source: {
          sourceType: SaleSourceType.KINESIOLOGY_SESSION,
          sourceId: request.sessionId,
          sourceCode: request.appointmentId ?? null,
        },
        items: [
          {
            description:
              request.description ??
              `Clinical Kinesiology Session - Therapist ${request.therapistId}`,
            skuOrCode: request.appointmentId ?? null,
            quantity: 1,
            unitPriceAmount: request.unitPriceAmount,
          },
        ],
      });

      const result = await this.createSaleHandler.execute(command);

      if (result.isFailure) {
        const err = result.getError();
        const errMessage = err instanceof Error ? err.message : String(err);
        return ApplicationResult.fail(errMessage);
      }

      const sale = result.getValue();
      return ApplicationResult.ok({
        saleId: sale.id,
        totalAmount: sale.totalAmount,
        currency: sale.currency,
        status: sale.status,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unexpected failure in Kinesiology sales gateway adapter.';
      return ApplicationResult.fail(message);
    }
  }
}
