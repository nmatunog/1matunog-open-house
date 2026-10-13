import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import {
  detailsFromEvent,
  eventDetailsTouchesStations,
  eventDetailsUpdate,
  stationFingerprint,
} from '../../src/lib/eventDetails';
import type { OhEvent } from '../../src/types';

function ts(ms: number): Timestamp {
  return Timestamp.fromMillis(ms);
}

const booths = [
  { id: 'booth-1', name: 'Products', codeHash: 'hash-1' },
  { id: 'booth-2', name: 'Vitality', codeHash: 'hash-2' },
];

const event: OhEvent = {
  id: 'evt-2026-10-13-614f9271',
  name: 'Test Open House',
  venue: 'Cebu',
  eventDate: '2026-10-14',
  checkInOpensAt: ts(Date.parse('2026-10-14T00:00:00.000Z')),
  checkInClosesAt: ts(Date.parse('2026-10-14T10:00:00.000Z')),
  raffle: {
    opensAt: ts(Date.parse('2026-10-14T00:00:00.000Z')),
    closesAt: ts(Date.parse('2026-10-14T10:00:00.000Z')),
    minStamps: 6,
    allowRepeatWinners: false,
    prizes: [],
  },
  booths,
  status: 'open',
  createdBy: 'nilo@example.com',
  pendingDrawNo: null,
  lastDrawNo: 0,
};

describe('edit event details', () => {
  it('editing the time keeps the event id and station codes identical', () => {
    const before = stationFingerprint(event);
    const prefill = detailsFromEvent(event);
    const patch = eventDetailsUpdate({
      ...prefill,
      name: '1CMA Open House',
      openT: '07:30',
      closeT: '19:00',
    });
    expect(eventDetailsTouchesStations(patch)).toBe(false);
    expect(patch).not.toHaveProperty('booths');
    expect(Object.keys(patch)).not.toContain('id');
    const after = { ...event, ...patch };
    expect(after.id).toBe(event.id);
    expect(stationFingerprint({ id: after.id, booths: after.booths })).toBe(before);
    expect(after.booths.map((b) => b.id)).toEqual(['booth-1', 'booth-2']);
    expect(after.booths.map((b) => b.codeHash)).toEqual(['hash-1', 'hash-2']);
  });

  it('prefill uses the saved name, date, venue, and Manila times', () => {
    const prefill = detailsFromEvent(event);
    expect(prefill.name).toBe('Test Open House');
    expect(prefill.venue).toBe('Cebu');
    expect(prefill.eventDate).toBe('2026-10-14');
    expect(prefill.openT).toBe('08:00');
    expect(prefill.closeT).toBe('18:00');
  });
});
