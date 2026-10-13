import { describe, expect, it } from 'vitest';
import { openCheckInNowPatch } from '../../src/lib/openCheckIn';

describe('open check-in now', () => {
  it('sets status open and moves the start to now without a rules change', () => {
    const now = new Date('2026-10-13T10:00:00.000Z');
    const closes = new Date('2026-10-14T10:00:00.000Z');
    const patch = openCheckInNowPatch(now, closes);
    expect(patch.status).toBe('open');
    expect(patch.checkInOpensAt.toDate().toISOString()).toBe(now.toISOString());
    expect(patch.checkInClosesAt).toBeUndefined();
  });

  it('also extends a close time that has already passed', () => {
    const now = new Date('2026-10-13T10:00:00.000Z');
    const patch = openCheckInNowPatch(now, new Date('2026-10-13T08:00:00.000Z'));
    expect(patch.checkInClosesAt?.toDate().getTime()).toBeGreaterThan(now.getTime());
  });
});
