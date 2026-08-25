import { InventoryItemDTO } from './inventory-item.dto';
import { StockMovementDTO } from './stock-movement.dto';

export interface StockMutationResultDTO {
  item: InventoryItemDTO;
  movement: StockMovementDTO;
}
