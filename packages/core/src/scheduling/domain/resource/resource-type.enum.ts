/**
 * Supported types of schedulable resources within Kinergy.
 *
 * Current system supports ROOM. Future expansion types (EQUIPMENT, THERAPY_BED,
 * RENTAL_FACILITY) are established here as domain taxonomy.
 */
export enum ResourceType {
  ROOM = 'ROOM',
  EQUIPMENT = 'EQUIPMENT',
  THERAPY_BED = 'THERAPY_BED',
  RENTAL_FACILITY = 'RENTAL_FACILITY',
}
