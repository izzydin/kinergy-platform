import { SessionId } from './session-id.vo';

describe('SessionId Value Object', () => {
  it('should generate a unique session id if none provided', () => {
    const id1 = SessionId.create();
    const id2 = SessionId.create();

    expect(id1.getValue()).toBeDefined();
    expect(id1.getValue().startsWith('sess_')).toBe(true);
    expect(id1.equals(id2)).toBe(false);
  });

  it('should wrap an existing string id and trim whitespace', () => {
    const id = SessionId.create('  custom_sess_123  ');
    expect(id.getValue()).toBe('custom_sess_123');
    expect(id.toString()).toBe('custom_sess_123');
  });

  it('should throw an error if an empty string is provided', () => {
    expect(() => SessionId.create('')).toThrow('Session ID cannot be empty.');
    expect(() => SessionId.create('   ')).toThrow('Session ID cannot be empty.');
  });

  it('should correctly compare equality with other SessionId instances', () => {
    const id1 = SessionId.create('sess_abc');
    const id2 = SessionId.create('sess_abc');
    const id3 = SessionId.create('sess_xyz');

    expect(id1.equals(id2)).toBe(true);
    expect(id1.equals(id3)).toBe(false);
  });
});
