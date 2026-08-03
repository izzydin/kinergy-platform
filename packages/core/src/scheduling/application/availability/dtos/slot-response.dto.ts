/** Response DTO representing an available slot */
export interface SlotResponseDTO {
  readonly startTime: string; // ISO 8601 string
  readonly endTime: string; // ISO 8601 string
  readonly therapistId: string;
  readonly roomId: string;
  readonly available: boolean;
  readonly score?: number;
}

/** Detail item for conflict check response */
export interface ConflictCheckItemDTO {
  readonly category: string;
  readonly conflictingEntityId: string;
  readonly reason: string;
}

/** Response DTO representing conflict check evaluation result */
export interface ConflictCheckResponseDTO {
  readonly hasConflict: boolean;
  readonly conflicts: ConflictCheckItemDTO[];
}

/** Response DTO representing a multi-resource combination slot */
export interface ResourceCombinationResponseDTO {
  readonly startTime: string; // ISO 8601 string
  readonly endTime: string; // ISO 8601 string
  readonly therapistId: string;
  readonly roomId: string;
}
