import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import {
  adminStampGrantFields,
  adminStampGrantTouchesStampCollection,
} from '../../src/lib/adminStamps';
import { eligiblePool, guestListStatus, isEligibleToWin } from '../../src/lib/eligibility';
import { mergeAdminAndScanCounts } from '../../src/lib/stations';
import type { Checkin, OhEvent } from '../../src/types';

function ts(ms: number): Timestamp {
  return Timestamp.fromMillis(ms);
}

const now = Date.UTC(2026, 9, 14, 1, 0, 0);
const booths = [1, 2, 3, 4, 5, 6].map((n) => ({
  id: `booth-${n}`,
  name: `Station ${n}`,
  codeHash: 'x',
}));

const event: OhEvent = {
  id: 'evt-live',
  name: 'Open House',
  venue: 'Cebu',
  eventDate: '2026-10-14',
  checkInOpensAt: ts(now - 3_600_000),
  checkInClosesAt: ts(now + 3_600_000),
  raffle: {
    opensAt: ts(now + 86_400_000),
    closesAt: ts(now + 172_800_000),
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

function checkin(id: string, adminBoothIds: string[] = []): Checkin {
  return {
    personId: id,
    name: 'Test Student',
    email: `${id}@example.com`,
    phone: '+639171234567',
    invitedBy: 'Ana',
    stampsCompleted: 0,
    checkedInAt: ts(now - 86_400_000),
    anonUid: 'anon',
    consentVersion: 'placeholder-1',
    adminBoothIds,
  };
}

describe('admin add stamps (no /stamps write)', () => {
  it('writes grant fields on the check-in, not stamp-doc fields the rules reject', () => {
    const payload = adminStampGrantFields({
      grantedBoothIds: booths.map((b) => b.id),
      allowedBoothIds: booths.map((b) => b.id),
      adminEmail: 'nilo@example.com',
    });
    expect(payload.adminStampSource).toBe('admin');
    expect(payload.adminStampBy).toBe('nilo@example.com');
    expect(payload.adminBoothIds).toHaveLength(6);
    expect(adminStampGrantTouchesStampCollection(payload)).toBe(false);
    expect(payload).not.toHaveProperty('stampKeyId');
    expect(payload).not.toHaveProperty('source');
  });

  it('merges scanned stations with admin grants and does not double-count', () => {
    const stamps = [
      { personId: 'a', boothId: 'booth-1' },
      { personId: 'a', boothId: 'booth-2' },
      { personId: 'a', boothId: 'booth-2' },
    ];
    const counts = mergeAdminAndScanCounts(stamps, [
      checkin('a', ['booth-2', 'booth-3', 'booth-4', 'booth-5', 'booth-6']),
    ]);
    expect(counts.get('a')).toBe(6);
    expect(guestListStatus(counts.get('a') ?? 0, 6)).toBe('Complete');
    expect(isEligibleToWin(checkin('a'), event, undefined, counts.get('a') ?? 0)).toBe(true);
    expect(eligiblePool([checkin('a')], event, new Map(), counts).map((c) => c.personId)).toEqual(['a']);
  });

  it('still counts as Complete when the guest checked in outside the raffle window', () => {
    const counts = mergeAdminAndScanCounts(
      [],
      [checkin('a', booths.map((b) => b.id))],
    );
    expect(isEligibleToWin(checkin('a'), event, undefined, counts.get('a') ?? 0)).toBe(true);
  });
});
