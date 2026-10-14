import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import {
  SUPER_CODE_SEE_HOST,
  superCodeEventFields,
  superCodeEventHash,
  superCodeExpiryDate,
  superCodeStillValid,
  typedCodeIsSuperCode,
} from '../../src/lib/superCode';
import type { OhEvent } from '../../src/types';

function ts(ms: number): Timestamp {
  return Timestamp.fromMillis(ms);
}

const eventBase: OhEvent = {
  id: 'evt-live',
  name: 'Open House',
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
  booths: [],
  status: 'open',
  createdBy: 'nilo@example.com',
  pendingDrawNo: null,
  lastDrawNo: 0,
};

describe('all-stations super code', () => {
  it('is tied to this event: the same letters do not match another event', async () => {
    const code = 'K7MP2Q';
    const hash = await superCodeEventHash('evt-live', code);
    const live = { ...eventBase, superCodeHash: hash, superCodeEnabled: true };
    expect(await typedCodeIsSuperCode(live, 'k7mp2q')).toBe(true);
    expect(await typedCodeIsSuperCode({ ...live, id: 'evt-other' }, code)).toBe(false);
  });

  it('turns off when disabled or past expiry', async () => {
    const hash = await superCodeEventHash('evt-live', 'ABC234');
    const expired = {
      ...eventBase,
      superCodeHash: hash,
      superCodeEnabled: true,
      superCodeExpiresAt: ts(Date.parse('2026-10-13T16:00:00.000Z')),
    };
    expect(superCodeStillValid(expired, new Date('2026-10-14T01:00:00.000Z'))).toBe(false);
    expect(
      superCodeStillValid(
        { ...eventBase, superCodeHash: hash, superCodeEnabled: false },
        new Date('2026-10-14T01:00:00.000Z'),
      ),
    ).toBe(false);
    expect(await typedCodeIsSuperCode({ ...expired, superCodeEnabled: false }, 'ABC234')).toBe(false);
  });

  it('expires at the earlier of check-in close and end of the event day', () => {
    const expires = superCodeExpiryDate(eventBase);
    expect(expires.toISOString()).toBe('2026-10-14T10:00:00.000Z');
  });

  it('stores only a hash on the public event, never the plain code', () => {
    const fields = superCodeEventFields({
      hash: 'abc',
      expiresAt: new Date('2026-10-14T10:00:00.000Z'),
      enabled: true,
    });
    expect(fields.superCodeEnabled).toBe(true);
    expect(JSON.stringify(fields)).not.toMatch(/K7MP2Q/);
    expect(SUPER_CODE_SEE_HOST).toMatch(/Add stamps/);
    expect(SUPER_CODE_SEE_HOST).not.toMatch(/\bCMA\b/);
  });
});
