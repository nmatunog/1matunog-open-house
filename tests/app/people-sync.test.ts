import { describe, expect, it } from 'vitest';
import { phoneIndexWriteAction } from '../../src/lib/peopleSync';

describe('phone-only matches are flagged, not merged', () => {
  it('creates an index for a new phone', () => {
    expect(phoneIndexWriteAction(undefined, 'person-a')).toBe('create');
  });

  it('keeps the same person on the same phone', () => {
    expect(phoneIndexWriteAction('person-a', 'person-a')).toBe('keep');
  });

  it('does not move the phone index onto a different email/person', () => {
    expect(phoneIndexWriteAction('person-a', 'person-b')).toBe('skip-collision');
  });
});
