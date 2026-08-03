import { Room } from './room.aggregate';
import { RoomId } from './room-id.vo';
import { RoomStatus } from '../value-objects/room-status.enum';

describe('Room Aggregate Root', () => {
  it('should create a valid Room aggregate with default AVAILABLE status and version 1', () => {
    const room = Room.create({
      name: 'Hydrotherapy Suite 1',
      capacity: 2,
      features: ['hydrotherapy_tub', 'soundproof'],
    });

    expect(room.id).toBeInstanceOf(RoomId);
    expect(room.name).toBe('Hydrotherapy Suite 1');
    expect(room.capacity).toBe(2);
    expect(room.status).toBe(RoomStatus.AVAILABLE);
    expect(room.version).toBe(1);
    expect(room.supportsFeatures(['hydrotherapy_tub'])).toBe(true);
    expect(room.supportsFeatures(['sauna'])).toBe(false);
  });

  it('should enforce positive capacity invariant', () => {
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

    const room = Room.create({ name: 'Valid Room', capacity: 1 });
    expect(() => room.changeCapacity(0)).toThrow();
  });

  it('should rename room and increment version counter', () => {
    const room = Room.create({ name: 'Room A', capacity: 1 });
    expect(room.version).toBe(1);

    room.rename('Room A Prime');
    expect(room.name).toBe('Room A Prime');
    expect(room.version).toBe(2);

    expect(() => room.rename('')).toThrow('New room name cannot be empty.');
  });

  it('should change room capacity and increment version counter', () => {
    const room = Room.create({ name: 'Suite 101', capacity: 1 });
    room.changeCapacity(4);

    expect(room.capacity).toBe(4);
    expect(room.version).toBe(2);
  });

  describe('Status Transitions & Maintenance', () => {
    it('should transition to MAINTENANCE with reason', () => {
      const room = Room.create({ name: 'Massage Room 3', capacity: 1 });

      room.markMaintenance('Plumbing repair');

      expect(room.status).toBe(RoomStatus.MAINTENANCE);
      expect(room.maintenanceReason).toBe('Plumbing repair');
      expect(room.version).toBe(2);
    });

    it('should throw error when marking maintenance without reason', () => {
      const room = Room.create({ name: 'Massage Room 3', capacity: 1 });
      expect(() => room.markMaintenance('')).toThrow('Maintenance reason is required.');
    });

    it('should transition to AVAILABLE and clear maintenance reason', () => {
      const room = Room.create({ name: 'Massage Room 3', capacity: 1 });
      room.markMaintenance('Plumbing repair');

      room.markAvailable();

      expect(room.status).toBe(RoomStatus.AVAILABLE);
      expect(room.maintenanceReason).toBeUndefined();
      expect(room.version).toBe(3);
    });

    it('should transition to UNAVAILABLE', () => {
      const room = Room.create({ name: 'Massage Room 3', capacity: 1 });
      room.markUnavailable('VIP Private Use');

      expect(room.status).toBe(RoomStatus.UNAVAILABLE);
      expect(room.maintenanceReason).toBe('VIP Private Use');
      expect(room.version).toBe(2);
    });
  });

  describe('Feature Set Management & Capabilities', () => {
    it('should add and remove features dynamically', () => {
      const room = Room.create({ name: 'Studio 1', capacity: 5 });

      expect(room.supportsFeatures(['adjustable_table'])).toBe(false);

      room.addFeature('Adjustable_Table');
      expect(room.supportsFeatures(['adjustable_table'])).toBe(true);
      expect(room.version).toBe(2);

      room.removeFeature('adjustable_table');
      expect(room.supportsFeatures(['adjustable_table'])).toBe(false);
      expect(room.version).toBe(3);
    });

    it('should evaluate multiple required features correctly', () => {
      const room = Room.create({
        name: 'Cryo Room',
        capacity: 1,
        features: ['cryo_chamber', 'oxygen_bar', 'wheelchair_accessible'],
      });

      expect(room.supportsFeatures(['cryo_chamber', 'wheelchair_accessible'])).toBe(true);
      expect(room.supportsFeatures(['cryo_chamber', 'sauna'])).toBe(false);
    });
  });

  describe('Reconstitution', () => {
    it('should reconstitute existing Room from persistence DTO', () => {
      const roomId = RoomId.create('room_existing_555');
      const room = Room.reconstitute({
        id: roomId,
        version: 12,
        name: 'Executive Suite',
        capacity: 3,
        status: RoomStatus.MAINTENANCE,
        features: ['shower', 'tv'],
        maintenanceReason: 'AC Servicing',
      });

      expect(room.id.getValue()).toBe('room_existing_555');
      expect(room.version).toBe(12);
      expect(room.name).toBe('Executive Suite');
      expect(room.capacity).toBe(3);
      expect(room.status).toBe(RoomStatus.MAINTENANCE);
      expect(room.maintenanceReason).toBe('AC Servicing');
      expect(room.supportsFeatures(['shower', 'tv'])).toBe(true);
    });
  });
});
