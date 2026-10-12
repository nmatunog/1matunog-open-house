import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import { eligiblePool, isEligibleToWin } from '../../src/lib/eligibility';
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
    const pool = eligiblePool([checkin('a'), checkin('b')], event, new Map());
    expect(pool.map((p) => p.personId)).toEqual(['a', 'b']);
  });

  it('drops people without enough stamps', () => {
    expect(isEligibleToWin(checkin('a', 5), event, undefined)).toBe(false);
  });

  it('drops a no-show so they cannot be drawn again in this event', () => {
    const lock: WinnerLock = { personId: 'a', drawNo: 1, status: 'no_show' };
    expect(isEligibleToWin(checkin('a'), event, lock)).toBe(false);
  });

  it('drops a claimed winner unless repeat winners are on', () => {
    const lock: WinnerLock = { personId: 'a', drawNo: 1, status: 'claimed' };
    expect(isEligibleToWin(checkin('a'), event, lock)).toBe(false);
    expect(
      isEligibleToWin(checkin('a'), { ...event, raffle: { ...event.raffle, allowRepeatWinners: true } }, lock),
    ).toBe(true);
  });
});
