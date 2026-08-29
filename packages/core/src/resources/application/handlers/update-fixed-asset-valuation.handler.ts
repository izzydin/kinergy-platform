import { CommandHandler } from '../shared/command-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { UpdateFixedAssetValuationCommand } from '../commands/update-fixed-asset-valuation.command';
import { FixedAssetDTO } from '../dtos/fixed-asset.dto';
import { FixedAssetRepositoryInterface } from '../../domain/assets/repositories/fixed-asset.repository.interface';
import { ResourcesEventPublisherPort } from '../ports/resources-event-publisher.port';
import { AssetId } from '../../domain/assets/value-objects/asset-id.vo';
import { Money } from '../../domain/inventory/value-objects/money.vo';
import { FixedAssetDtoMapper } from '../mappers/fixed-asset-dto.mapper';

export class UpdateFixedAssetValuationHandler implements CommandHandler<
  UpdateFixedAssetValuationCommand,
  ApplicationResult<FixedAssetDTO>
> {
  constructor(
    private readonly assetRepository: FixedAssetRepositoryInterface,
    private readonly eventPublisher?: ResourcesEventPublisherPort,
  ) {}

  async execute(
    command: UpdateFixedAssetValuationCommand,
  ): Promise<ApplicationResult<FixedAssetDTO>> {
    const { input } = command;

    try {
      // 1. Mandatory actor validation
      if (!input.actorId || input.actorId.trim().length === 0) {
        return ApplicationResult.fail(
          'Authenticated actor ID is required to update asset valuation.',
        );
      }

      // 2. Value validation (amount >= 0)
      if (typeof input.estimatedValue?.amount !== 'number' || input.estimatedValue.amount < 0) {
        return ApplicationResult.fail('Estimated value amount must be a non-negative number.');
      }

      // 3. Validate and parse AssetId UUID
      let assetId: AssetId;
      try {
        assetId = AssetId.create(input.id);
      } catch {
        return ApplicationResult.fail(`Fixed asset with ID '${input.id}' was not found.`);
      }

      // 4. Retrieve aggregate and verify tenant isolation
      const asset = await this.assetRepository.findById(assetId);
      if (!asset) {
        return ApplicationResult.fail(`Fixed asset with ID '${input.id}' was not found.`);
      }

      if (input.tenantId && asset.tenantId && asset.tenantId !== input.tenantId) {
        return ApplicationResult.fail(`Fixed asset with ID '${input.id}' was not found.`);
      }

      // 5. Construct Money VO with fixed precision
      const currency = input.estimatedValue.currency || asset.currentEstimatedValue.currency;
      const newEstimatedValue = Money.create(input.estimatedValue.amount, currency);

      const initialVersion = asset.version;

      // 6. Execute domain value update (enforces [AST-INV-1], [AST-INV-8])
      asset.updateEstimatedValue(newEstimatedValue, input.actorId, input.reason);

      // 7. Persist atomically if value actually changed (idempotent no-op skip)
      if (asset.version > initialVersion) {
        await this.assetRepository.save(asset);

        // 8. Publish domain events via integration bus
        if (this.eventPublisher) {
          const events = asset.getUncommittedEvents();
          if (events.length > 0) {
            await this.eventPublisher.publish(events);
            asset.clearEvents();
          }
        }
      }

      return ApplicationResult.ok(FixedAssetDtoMapper.toDTO(asset));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to update fixed asset valuation';
      return ApplicationResult.fail(message);
    }
  }
}
