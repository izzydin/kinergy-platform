import { SchedulableResource } from './schedulable-resource.interface';
import { ResourceType } from './resource-type.enum';
import { ResourceStatus } from './resource-status.enum';
import { Room } from '../room/room.aggregate';
import { RoomId } from '../room/room-id.vo';

describe('SchedulableResource Domain Foundation', () => {
  describe('Capability Contract & Polymorphic Handling', () => {
    it('should allow Room to implement SchedulableResource contract', () => {
      const room = Room.create({
        id: RoomId.create('room_101'),
        name: 'Therapy Suite A',
        capacity: 2,
        features: ['ultrasound', 'plinth'],
      });

      const resource: SchedulableResource<RoomId> = room;

      expect(resource.id.getValue()).toBe('room_101');
      expect(resource.resourceType).toBe(ResourceType.ROOM);
      expect(resource.name).toBe('Therapy Suite A');
      expect(resource.capacity).toBe(2);
      expect(resource.status).toBe(ResourceStatus.AVAILABLE);
      expect(resource.version).toBe(1);
      expect(resource.isReservable()).toBe(true);
    });

    it('should filter generic SchedulableResources by capacity and reservability', () => {
      const roomA = Room.create({
        name: 'Small Consultation Room',
        capacity: 1,
        status: ResourceStatus.AVAILABLE,
      });

      const roomB = Room.create({
        name: 'Large Rehabilitation Gym',
        capacity: 10,
        status: ResourceStatus.AVAILABLE,
      });

      const roomC = Room.create({
        name: 'Hydrotherapy Suite',
        capacity: 3,
        status: ResourceStatus.MAINTENANCE,
      });

      const resources: SchedulableResource[] = [roomA, roomB, roomC];

      // Generic capability query: find all reservable resources with capacity >= 2
      const reservableLargeResources = resources.filter((r) => r.isReservable() && r.capacity >= 2);

      expect(reservableLargeResources).toHaveLength(1);
      expect(reservableLargeResources[0]?.name).toBe('Large Rehabilitation Gym');
      expect(reservableLargeResources[0]?.capacity).toBe(10);
    });
  });

  describe('Domain Invariants & Lifecycle States', () => {
    describe('Capacity Invariants', () => {
      it('should enforce positive integer capacity strictly greater than zero', () => {
        expect(() =>
          Room.create({
            name: 'Invalid Room',
            capacity: 0,
          }),
        ).toThrow('Room capacity must be a positive integer strictly greater than zero.');

        expect(() =>
          Room.create({
            name: 'Invalid Room',
            capacity: -5,
          }),
        ).toThrow('Room capacity must be a positive integer strictly greater than zero.');

        expect(() =>
          Room.create({
            name: 'Invalid Room',
            capacity: 2.5,
          }),
        ).toThrow('Room capacity must be a positive integer strictly greater than zero.');

        expect(() =>
          Room.create({
            name: 'Invalid Room',
            capacity: NaN,
          }),
        ).toThrow('Room capacity must be a positive integer strictly greater than zero.');
      });

      it('should reject invalid capacity updates during mutation', () => {
        const room = Room.create({
          name: 'Standard Room',
          capacity: 2,
        });

        expect(() => room.changeCapacity(0)).toThrow(
          'Room capacity must be a positive integer strictly greater than zero.',
        );
        expect(() => room.changeCapacity(-1)).toThrow(
          'Room capacity must be a positive integer strictly greater than zero.',
        );
        expect(() => room.changeCapacity(1.2)).toThrow(
          'Room capacity must be a positive integer strictly greater than zero.',
        );
      });
    });

    describe('Identity Invariants', () => {
      it('should enforce non-empty resource name invariant', () => {
        expect(() =>
          Room.create({
            name: '',
            capacity: 1,
          }),
        ).toThrow('Room name cannot be empty.');

        expect(() =>
          Room.create({
            name: '   ',
            capacity: 1,
          }),
        ).toThrow('Room name cannot be empty.');
      });

      it('should reject invalid name updates', () => {
        const room = Room.create({
          name: 'Valid Room',
          capacity: 1,
        });

        expect(() => room.rename('')).toThrow('New room name cannot be empty.');
        expect(() => room.rename('   ')).toThrow('New room name cannot be empty.');
      });
    });

    describe('Reservability & Operational Status Lifecycle', () => {
      it('should evaluate isReservable as true when status is AVAILABLE', () => {
        const room = Room.create({
          name: 'Active Room',
          capacity: 2,
          status: ResourceStatus.AVAILABLE,
        });

        expect(room.status).toBe(ResourceStatus.AVAILABLE);
        expect(room.isReservable()).toBe(true);
      });

      it('should evaluate isReservable as false when placed under MAINTENANCE', () => {
        const room = Room.create({
          name: 'Active Room',
          capacity: 2,
          status: ResourceStatus.AVAILABLE,
        });

        room.markMaintenance('HVAC filter replacement');

        expect(room.status).toBe(ResourceStatus.MAINTENANCE);
        expect(room.maintenanceReason).toBe('HVAC filter replacement');
        expect(room.isReservable()).toBe(false);
        expect(room.version).toBe(2);
      });

      it('should require a non-empty reason when placing under MAINTENANCE', () => {
        const room = Room.create({
          name: 'Active Room',
          capacity: 2,
        });

        expect(() => room.markMaintenance('')).toThrow('Maintenance reason is required.');
        expect(() => room.markMaintenance('   ')).toThrow('Maintenance reason is required.');
      });

      it('should evaluate isReservable as false when marked UNAVAILABLE', () => {
        const room = Room.create({
          name: 'Active Room',
          capacity: 2,
          status: ResourceStatus.AVAILABLE,
        });

        room.markUnavailable('Decommissioned');

        expect(room.status).toBe(ResourceStatus.UNAVAILABLE);
        expect(room.isReservable()).toBe(false);
        expect(room.version).toBe(2);
      });

      it('should restore isReservable to true when marked back to AVAILABLE', () => {
        const room = Room.create({
          name: 'Under Maintenance Room',
          capacity: 2,
          status: ResourceStatus.MAINTENANCE,
        });

        expect(room.isReservable()).toBe(false);

        room.markAvailable();

        expect(room.status).toBe(ResourceStatus.AVAILABLE);
        expect(room.maintenanceReason).toBeUndefined();
        expect(room.isReservable()).toBe(true);
        expect(room.version).toBe(2);
      });
    });
  });

  describe('Isolation from Resource-Specific Features', () => {
    it('should keep room-specific feature checks encapsulated in Room without polluting generic interface', () => {
      const room = Room.create({
        name: 'Specialized Treatment Room',
        capacity: 1,
        features: ['traction_table', 'diathermy'],
      });

      // Room-specific method
      expect(room.supportsFeatures(['traction_table'])).toBe(true);
      expect(room.supportsFeatures(['hydrotherapy_tub'])).toBe(false);

      // Generic SchedulableResource reference does not expose room-specific features
      const resource: SchedulableResource = room;
      expect(resource.resourceType).toBe(ResourceType.ROOM);
      expect(resource.isReservable()).toBe(true);
    });
  });
});
