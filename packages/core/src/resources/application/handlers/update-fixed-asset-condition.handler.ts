import { CommandHandler } from '../shared/command-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { UpdateFixedAssetConditionCommand } from '../commands/update-fixed-asset-condition.command';
import { FixedAssetDTO } from '../dtos/fixed-asset.dto';
import { FixedAssetRepositoryInterface } from '../../domain/assets/repositories/fixed-asset.repository.interface';
import { ResourcesEventPublisherPort } from '../ports/resources-event-publisher.port';
import { AssetId } from '../../domain/assets/value-objects/asset-id.vo';
import { isAssetCondition } from '../../domain/assets/enums/asset-condition.enum';
import { FixedAssetDtoMapper } from '../mappers/fixed-asset-dto.mapper';

export class UpdateFixedAssetConditionHandler implements CommandHandler<
  UpdateFixedAssetConditionCommand,
  ApplicationResult<FixedAssetDTO>
> {
  constructor(
    private readonly assetRepository: FixedAssetRepositoryInterface,
    private readonly eventPublisher?: ResourcesEventPublisherPort,
  ) {}

  async execute(
    command: UpdateFixedAssetConditionCommand,
  ): Promise<ApplicationResult<FixedAssetDTO>> {
    const { input } = command;

    try {
      // 1. Mandatory actor validation
      if (!input.actorId || input.actorId.trim().length === 0) {
        return ApplicationResult.fail(
          'Authenticated actor ID is required to update asset condition.',
        );
      }

      // 2. Condition enum validation
      if (!isAssetCondition(input.condition)) {
        return ApplicationResult.fail(`Invalid asset condition '${input.condition}'.`);
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

      const initialVersion = asset.version;

      // 5. Execute domain condition update (enforces [AST-INV-1], [AST-INV-5], [AST-INV-8])
      asset.updateCondition(input.condition, input.actorId, input.reason);

      // 6. Persist atomically if condition actually changed (idempotent no-op skip)
      if (asset.version > initialVersion) {
        await this.assetRepository.save(asset);

        // 7. Publish domain events via integration bus
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
        error instanceof Error ? error.message : 'Failed to update fixed asset condition';
      return ApplicationResult.fail(message);
    }
  }
}
