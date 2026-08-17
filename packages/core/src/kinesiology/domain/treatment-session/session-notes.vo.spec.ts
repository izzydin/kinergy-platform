import { SessionNotes, MAX_NOTE_SECTION_LENGTH } from './session-notes.vo';

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

  it('should trim whitespace-only SOAP fields and treat them as undefined', () => {
    const notes = SessionNotes.create({
      subjective: '   ',
      objective: '  \t  ',
      assessment: '   \n  ',
      plan: '   ',
      rawText: '   ',
    });

    expect(notes.hasContent()).toBe(false);
    expect(notes.getSubjective()).toBeUndefined();
    expect(notes.getObjective()).toBeUndefined();
    expect(notes.getAssessment()).toBeUndefined();
    expect(notes.getPlan()).toBeUndefined();
    expect(notes.getRawText()).toBeUndefined();
    expect(notes.toString()).toBe('');
  });

  it('should normalize CRLF line breaks to standard LF', () => {
    const notes = SessionNotes.create({
      subjective: 'Line 1\r\nLine 2\r\nLine 3',
    });

    expect(notes.getSubjective()).toBe('Line 1\nLine 2\nLine 3');
  });

  it('should reject note sections exceeding MAX_NOTE_SECTION_LENGTH', () => {
    const oversizedText = 'a'.repeat(MAX_NOTE_SECTION_LENGTH + 1);

    expect(() =>
      SessionNotes.create({
        subjective: oversizedText,
      }),
    ).toThrow(`Subjective note section cannot exceed ${MAX_NOTE_SECTION_LENGTH} characters.`);
  });

  it('should handle null or undefined input gracefully via create()', () => {
    const notesNull = SessionNotes.create(undefined);
    expect(notesNull.hasContent()).toBe(false);
    expect(notesNull.equals(SessionNotes.empty())).toBe(true);
  });

  it('should format toString correctly for structured SOAP notes', () => {
    const notes = SessionNotes.create({
      subjective: 'Pain',
      objective: 'Spasm',
      assessment: 'Trigger point',
      plan: 'Therapy',
    });

    expect(notes.toString()).toBe('S: Pain | O: Spasm | A: Trigger point | P: Therapy');
  });
});
