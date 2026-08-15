import { MaintenanceWindowDTO } from './maintenance-window.dto';

export interface RoomDTO {
  id: string;
  name: string;
  capacity: number;
  status: string;
  resourceType: string;
  features: string[];
  maintenanceReason?: string;
  maintenanceWindows: MaintenanceWindowDTO[];
  version: number;
  createdAt: string;
  updatedAt: string;
}
