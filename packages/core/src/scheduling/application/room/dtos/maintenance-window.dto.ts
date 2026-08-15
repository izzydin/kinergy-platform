export interface MaintenanceWindowDTO {
  id: string;
  roomId?: string;
  startTime: string;
  endTime: string;
  reason: string;
  createdAt: string;
}
