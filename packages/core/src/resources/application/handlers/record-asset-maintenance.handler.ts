import { CommandHandler } from '../shared/command-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { RecordAssetMaintenanceCommand } from '../commands/record-asset-maintenance.command';
import { AssetMaintenanceRecordDTO } from '../dtos/asset-maintenance-record.dto';
import { FixedAssetRepositoryInterface } from '../../domain/assets/repositories/fixed-asset.repository.interface';
import { ResourcesEventPublisherPort } from '../ports/resources-event-publisher.port';
import { AssetId } from '../../domain/assets/value-objects/asset-id.vo';
import { Money } from '../../domain/inventory/value-objects/money.vo';
import { isAssetCondition } from '../../domain/assets/enums/asset-condition.enum';
import { FixedAssetDtoMapper } from '../mappers/fixed-asset-dto.mapper';

export class RecordAssetMaintenanceHandler implements CommandHandler<
  RecordAssetMaintenanceCommand,
  ApplicationResult<AssetMaintenanceRecordDTO>
> {
  constructor(
    private readonly assetRepository: FixedAssetRepositoryInterface,
    private readonly eventPublisher?: ResourcesEventPublisherPort,
  ) {}

  async execute(
    command: RecordAssetMaintenanceCommand,
  ): Promise<ApplicationResult<AssetMaintenanceRecordDTO>> {
    const { input } = command;

    try {
      // 1. Mandatory actor validation
      if (!input.actorId || input.actorId.trim().length === 0) {
        return ApplicationResult.fail(
          'Authenticated actor ID is required to record asset maintenance.',
        );
      }

      // 2. Mandatory description validation (min 3 chars)
      if (!input.description || input.description.trim().length < 3) {
        return ApplicationResult.fail('Maintenance description must be at least 3 characters.');
      }

      // 3. Mandatory performedBy validation
      if (!input.performedBy || input.performedBy.trim().length === 0) {
        return ApplicationResult.fail('PerformedBy technician or service provider is required.');
      }

      // 4. Validate serviceDate
      const serviceDate =
        input.serviceDate instanceof Date ? input.serviceDate : new Date(input.serviceDate);
      if (isNaN(serviceDate.getTime())) {
        return ApplicationResult.fail('Invalid maintenance service date.');
      }

      // 5. Validate cost (amount >= 0)
      if (typeof input.cost?.amount !== 'number' || input.cost.amount < 0) {
        return ApplicationResult.fail('Maintenance cost amount must be a non-negative number.');
      }

      // 6. Validate condition enum if provided
      if (input.updateConditionTo && !isAssetCondition(input.updateConditionTo)) {
        return ApplicationResult.fail(`Invalid update condition '${input.updateConditionTo}'.`);
      }

      // 7. Validate and parse AssetId UUID
      let assetId: AssetId;
      try {
        assetId = AssetId.create(input.assetId);
      } catch {
        return ApplicationResult.fail(`Fixed asset with ID '${input.assetId}' was not found.`);
      }

      // 8. Retrieve aggregate and verify tenant boundary
      const asset = await this.assetRepository.findById(assetId);
      if (!asset) {
        return ApplicationResult.fail(`Fixed asset with ID '${input.assetId}' was not found.`);
      }

      if (input.tenantId && asset.tenantId && asset.tenantId !== input.tenantId) {
        return ApplicationResult.fail(`Fixed asset with ID '${input.assetId}' was not found.`);
      }

      // 9. Construct Money VO
      const currency = input.cost.currency || asset.currentEstimatedValue.currency;
      const costMoney = Money.create(input.cost.amount, currency);

      // 10. Execute domain maintenance recording (enforces [AST-INV-1], [AST-INV-6])
      const maintenanceRecord = asset.recordMaintenance(
        {
          serviceDate,
          description: input.description.trim(),
          cost: costMoney,
          performedBy: input.performedBy.trim(),
          notes: input.notes,
          updateConditionTo: input.updateConditionTo,
        },
        input.actorId,
      );

      // 11. Persist aggregate and new records atomically
      await this.assetRepository.save(asset);

      // 12. Publish domain events via integration bus
      if (this.eventPublisher) {
        const events = asset.getUncommittedEvents();
        if (events.length > 0) {
          await this.eventPublisher.publish(events);
          asset.clearEvents();
        }
      }

      return ApplicationResult.ok(FixedAssetDtoMapper.toMaintenanceDTO(maintenanceRecord));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to record fixed asset maintenance';
      return ApplicationResult.fail(message);
    }
  }
}
