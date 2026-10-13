import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import { eligiblePool, isEligibleToWin } from '../../src/lib/eligibility';
import { countStampsByPerson, stampCountFor } from '../../src/lib/stations';
import type { Checkin, OhEvent, WinnerLock } from '../../src/types';

function ts(ms: number): Timestamp {
  return Timestamp.fromMillis(ms);
}

const now = Date.UTC(2026, 10, 14, 6, 0, 0);
const opens = ts(now - 3_600_000);
const closes = ts(now + 3_600_000);

const event: OhEvent = {
  id: 'e1',
  name: 'Open House',
  venue: 'Cebu',
  eventDate: '2026-11-14',
  checkInOpensAt: opens,
  checkInClosesAt: closes,
  raffle: {
    opensAt: opens,
    closesAt: closes,
    minStamps: 6,
    allowRepeatWinners: false,
    prizes: [],
  },
  booths: [],
  status: 'open',
  createdBy: 'nilo@example.com',
  pendingDrawNo: null,
  lastDrawNo: 0,
};

function checkin(id: string, stamps = 6): Checkin {
  return {
    personId: id,
    name: 'Juan Dela Cruz',
    email: `${id}@example.com`,
    phone: '+639171234567',
    invitedBy: 'Ana',
    stampsCompleted: stamps,
    checkedInAt: ts(now),
    anonUid: 'anon',
    consentVersion: 'placeholder-1',
  };
}

describe('live raffle eligibility', () => {
  it('includes people who just checked in (no snapshot)', () => {
    const stamps = new Map([
      ['a', 6],
      ['b', 6],
    ]);
    const pool = eligiblePool([checkin('a'), checkin('b')], event, new Map(), stamps);
    expect(pool.map((p) => p.personId)).toEqual(['a', 'b']);
  });

  it('drops people without enough stamp documents', () => {
    expect(isEligibleToWin(checkin('a', 5), event, undefined, 5)).toBe(false);
  });

  it('ignores a self-reported stamp counter on the check-in', () => {
    expect(isEligibleToWin(checkin('a', 6), event, undefined, 0)).toBe(false);
    expect(isEligibleToWin(checkin('a', 0), event, undefined, 6)).toBe(true);
  });

  it('never counts stamp documents from another event', () => {
    const stampsThisEvent = [{ personId: 'a' }, { personId: 'a' }];
    const stampsOtherEvent = Array.from({ length: 6 }, () => ({ personId: 'a' }));
    const thisEventCounts = countStampsByPerson(stampsThisEvent);
    expect(stampCountFor('a', thisEventCounts)).toBe(2);
    expect(stampCountFor('a', countStampsByPerson(stampsOtherEvent))).toBe(6);
    // Eligibility for this event only receives this event's stamp list (see loadLivePool).
    expect(isEligibleToWin(checkin('a', 6), event, undefined, stampCountFor('a', thisEventCounts))).toBe(
      false,
    );
  });

  it('respects minStamps from the event', () => {
    const tight = { ...event, raffle: { ...event.raffle, minStamps: 3 } };
    expect(isEligibleToWin(checkin('a'), tight, undefined, 2)).toBe(false);
    expect(isEligibleToWin(checkin('a'), tight, undefined, 3)).toBe(true);
  });

  it('drops a no-show so they cannot be drawn again in this event', () => {
    const lock: WinnerLock = { personId: 'a', drawNo: 1, status: 'no_show' };
    expect(isEligibleToWin(checkin('a'), event, lock, 6)).toBe(false);
  });

  it('drops a claimed winner unless repeat winners are on', () => {
    const lock: WinnerLock = { personId: 'a', drawNo: 1, status: 'claimed' };
    expect(isEligibleToWin(checkin('a'), event, lock, 6)).toBe(false);
    expect(
      isEligibleToWin(checkin('a'), { ...event, raffle: { ...event.raffle, allowRepeatWinners: true } }, lock, 6),
    ).toBe(true);
  });
});
