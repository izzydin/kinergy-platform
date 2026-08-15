import { SessionNotes } from './session-notes.vo';

describe('SessionNotes Value Object', () => {
  it('should create an empty SessionNotes instance when no input is provided', () => {
    const notes = SessionNotes.empty();
    expect(notes.hasContent()).toBe(false);
    expect(notes.getSubjective()).toBeUndefined();
    expect(notes.getObjective()).toBeUndefined();
    expect(notes.getAssessment()).toBeUndefined();
    expect(notes.getPlan()).toBeUndefined();
    expect(notes.getRawText()).toBeUndefined();
  });

  it('should create SessionNotes from raw string', () => {
    const notes = SessionNotes.create('Client reported mild lower back stiffness.');
    expect(notes.hasContent()).toBe(true);
    expect(notes.getRawText()).toBe('Client reported mild lower back stiffness.');
    expect(notes.toString()).toBe('Notes: Client reported mild lower back stiffness.');
  });

  it('should create SessionNotes from structured SOAP properties', () => {
    const notes = SessionNotes.create({
      subjective: 'Pain in right shoulder after swimming.',
      objective: 'Reduced abduction to 120 degrees.',
      assessment: 'Supraspinatus hypertonicity.',
      plan: 'Neuromuscular reset and light rotator cuff exercises.',
    });

    expect(notes.hasContent()).toBe(true);
    expect(notes.getSubjective()).toBe('Pain in right shoulder after swimming.');
    expect(notes.getObjective()).toBe('Reduced abduction to 120 degrees.');
    expect(notes.getAssessment()).toBe('Supraspinatus hypertonicity.');
    expect(notes.getPlan()).toBe('Neuromuscular reset and light rotator cuff exercises.');
  });

  it('should test structural equality between instances', () => {
    const note1 = SessionNotes.create({ subjective: 'Tension', plan: 'Rest' });
    const note2 = SessionNotes.create({ subjective: 'Tension', plan: 'Rest' });
    const note3 = SessionNotes.create({ subjective: 'Tension', plan: 'Massage' });

    expect(note1.equals(note2)).toBe(true);
    expect(note1.equals(note3)).toBe(false);
  });
});
