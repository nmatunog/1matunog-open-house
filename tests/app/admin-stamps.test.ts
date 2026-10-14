import { describe, expect, it } from 'vitest';
import {
  ADMIN_STAMP_SOURCE,
  adminStampFields,
  boothIdsDoneForPerson,
  shouldShowAddStamps,
  stationsStillOpen,
} from '../../src/lib/adminStamps';
import { guestListStatus, isEligibleToWin } from '../../src/lib/eligibility';
import { stampDocId } from '../../src/lib/stations';
import type { Checkin, OhEvent } from '../../src/types';
import { Timestamp } from 'firebase/firestore';

const booths = [1, 2, 3].map((n) => ({ id: `booth-${n}`, name: `Station ${n}`, codeHash: 'x' }));

function checkin(id = 'p1'): Checkin {
  return {
    personId: id,
    name: 'Maria Santos',
    email: 'maria@example.com',
    phone: '+639171234567',
    invitedBy: 'Ana',
    stampsCompleted: 0,
    checkedInAt: Timestamp.fromMillis(1),
    anonUid: 'guest-uid-1',
    consentVersion: 'v1',
  };
}

function event(): OhEvent {
  return {
    id: 'evt-1',
    name: 'Open House',
    venue: 'Cebu',
    eventDate: '2026-10-14',
    checkInOpensAt: Timestamp.fromMillis(1),
    checkInClosesAt: Timestamp.fromMillis(9),
    raffle: {
      opensAt: Timestamp.fromMillis(1),
      closesAt: Timestamp.fromMillis(9),
      minStamps: 3,
      allowRepeatWinners: false,
      prizes: [],
    },
    booths,
    status: 'open',
    createdBy: 'nilo@example.com',
    pendingDrawNo: null,
    lastDrawNo: 0,
  };
}

describe('admin add-stamps helpers', () => {
  it('shows Add stamps only for an admin when the guest is not Complete', () => {
    expect(shouldShowAddStamps({ isAdmin: true, uniqueStations: 0, needed: 3 })).toBe(true);
    expect(shouldShowAddStamps({ isAdmin: true, uniqueStations: 2, needed: 3 })).toBe(true);
    expect(shouldShowAddStamps({ isAdmin: true, uniqueStations: 3, needed: 3 })).toBe(false);
    expect(shouldShowAddStamps({ isAdmin: false, uniqueStations: 0, needed: 3 })).toBe(false);
  });

  it('writes the same path and guest fields, plus source admin', () => {
    const fields = adminStampFields({
      boothId: 'booth-2',
      anonUid: 'guest-uid-1',
      personId: 'p1',
      stampKeyId: 'a'.repeat(64),
    });
    expect(stampDocId(fields.anonUid, fields.boothId)).toBe('guest-uid-1_booth-2');
    expect(fields).toMatchObject({
      boothId: 'booth-2',
      anonUid: 'guest-uid-1',
      personId: 'p1',
      stampKeyId: 'a'.repeat(64),
      source: ADMIN_STAMP_SOURCE,
    });
    expect(fields.source).toBe('admin');
    expect(Object.keys(fields).sort()).toEqual(
      ['anonUid', 'boothId', 'personId', 'source', 'stampKeyId', 'stampedAt'].sort(),
    );
  });

  it('marks Complete and eligible from unique stamp docs, not the check-in counter', () => {
    const e = event();
    const c = checkin();
    const stamps = booths.map((b) => ({ personId: c.personId, boothId: b.id }));
    const unique = boothIdsDoneForPerson(stamps, c.personId).length;
    expect(unique).toBe(3);
    expect(guestListStatus(unique, e.booths.length)).toBe('Complete');
    expect(isEligibleToWin({ ...c, stampsCompleted: 0 }, e, undefined, unique)).toBe(true);
    expect(stationsStillOpen(e.booths.map((b) => b.id), boothIdsDoneForPerson(stamps, c.personId))).toEqual([]);
  });

  it('does not count another guest or a duplicate station', () => {
    const stamps = [
      { personId: 'p1', boothId: 'booth-1' },
      { personId: 'p1', boothId: 'booth-1' },
      { personId: 'p2', boothId: 'booth-2' },
    ];
    expect(boothIdsDoneForPerson(stamps, 'p1')).toEqual(['booth-1']);
    expect(stationsStillOpen(['booth-1', 'booth-2', 'booth-3'], ['booth-1'])).toEqual(['booth-2', 'booth-3']);
  });
});
