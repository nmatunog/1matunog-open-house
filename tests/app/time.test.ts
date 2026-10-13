import { describe, expect, it } from 'vitest';
import { formatManilaDate, formatManilaHm, manilaDateTimeToDate } from '../../src/lib/time';

describe('event dates come from the event, not the code', () => {
  it('formats whatever date the admin saved', () => {
    const label = formatManilaDate('2026-11-14');
    expect(label).toMatch(/Nov/);
    expect(label).toMatch(/14/);
  });

  it('treats 08:00 Manila as UTC+8', () => {
    const d = manilaDateTimeToDate('2026-11-14', '08:00');
    expect(d.toISOString()).toBe('2026-11-14T00:00:00.000Z');
    expect(formatManilaHm(d)).toBe('08:00');
  });
});
