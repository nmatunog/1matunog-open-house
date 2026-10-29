import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import { eligiblePool, guestListStatus, isEligibleToWin, stationsNeeded } from '../../src/lib/eligibility';
import { countUniqueStationsByPerson, stampCountFor } from '../../src/lib/stations';
import type { Checkin, OhEvent, WinnerLock } from '../../src/types';

function ts(ms: number): Timestamp {
  return Timestamp.fromMillis(ms);
}

const now = Date.UTC(2026, 9, 13, 10, 0, 0);
const opens = ts(now - 3_600_000);
const closes = ts(now + 3_600_000);
const raffleLater = ts(now + 24 * 3_600_000);

const booths = [1, 2, 3, 4, 5, 6].map((n) => ({
  id: `booth-${n}`,
  name: `Station ${n}`,
  codeHash: 'x',
}));

const event: OhEvent = {
  id: 'e1',
  name: 'Open House',
  venue: 'Cebu',
  eventDate: '2026-10-14',
  checkInOpensAt: opens,
  checkInClosesAt: closes,
  raffle: {
    opensAt: raffleLater,
    closesAt: ts(now + 30 * 3_600_000),
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

function checkin(id: string, stamps = 6): Checkin {
  return {
    personId: id,
    name: 'Test Student',
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
  it('allows a checked-in guest without stamps only when scan requirement is suspended', () => {
    const suspended = { ...event, boothScanRequirementSuspended: true };
    expect(isEligibleToWin(checkin('a', 0), event, undefined, 0)).toBe(false);
    expect(isEligibleToWin(checkin('a', 0), suspended, undefined, 0)).toBe(true);
    expect(eligiblePool([checkin('a', 0)], suspended, new Map(), new Map()).length).toBe(1);
    expect(isEligibleToWin({ ...checkin('a'), checkedInAt: undefined as unknown as Timestamp }, suspended, undefined, 0)).toBe(false);
  });

  it('keeps winner exclusions in suspended mode', () => {
    const suspended = { ...event, boothScanRequirementSuspended: true };
    const claimed: WinnerLock = { personId: 'a', drawNo: 1, status: 'claimed' };
    const pending: WinnerLock = { personId: 'a', drawNo: 1, status: 'pending' };
    expect(isEligibleToWin(checkin('a'), suspended, claimed, 0)).toBe(false);
    expect(isEligibleToWin(checkin('a'), suspended, pending, 0)).toBe(false);
  });

  it('needs a unique stamp at every station, from stamp documents', () => {
    expect(stationsNeeded(event)).toBe(6);
    expect(isEligibleToWin(checkin('a', 6), event, undefined, 5)).toBe(false);
    expect(isEligibleToWin(checkin('a', 0), event, undefined, 6)).toBe(true);
    expect(guestListStatus(5, 6)).toBe('Open');
    expect(guestListStatus(6, 6)).toBe('Complete');
  });

  it('includes a guest who has all stations even if they checked in before the raffle window', () => {
    expect(isEligibleToWin(checkin('a', 0), event, undefined, 6)).toBe(true);
    const pool = eligiblePool([checkin('a')], event, new Map(), new Map([['a', 6]]));
    expect(pool.map((p) => p.personId)).toEqual(['a']);
  });

  it('ignores a self-reported stamp counter on the check-in', () => {
    expect(isEligibleToWin(checkin('a', 6), event, undefined, 0)).toBe(false);
    expect(isEligibleToWin(checkin('a', 0), event, undefined, 6)).toBe(true);
  });

  it('counts unique stations and never stamps from another event', () => {
    const stampsThisEvent = [
      { personId: 'a', boothId: 'booth-1' },
      { personId: 'a', boothId: 'booth-1' },
      { personId: 'a', boothId: 'booth-2' },
    ];
    const stampsOtherEvent = booths.map((b) => ({ personId: 'a', boothId: b.id }));
    const thisEventCounts = countUniqueStationsByPerson(stampsThisEvent);
    expect(stampCountFor('a', thisEventCounts)).toBe(2);
    expect(stampCountFor('a', countUniqueStationsByPerson(stampsOtherEvent))).toBe(6);
    expect(isEligibleToWin(checkin('a', 6), event, undefined, stampCountFor('a', thisEventCounts))).toBe(false);
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
