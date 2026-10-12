import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import { checkinsCsv, winnersCsv } from '../../src/lib/csv';
import type { Checkin, Draw } from '../../src/types';

const c1: Checkin = {
  personId: 'p1',
  name: 'A',
  email: 'a@example.com',
  phone: '+639171111111',
  invitedBy: 'X',
  stampsCompleted: 6,
  checkedInAt: Timestamp.fromMillis(1),
  anonUid: 'u',
  consentVersion: 'placeholder-1',
};
const c2: Checkin = { ...c1, personId: 'p2', email: 'b@example.com', name: 'B' };

describe('per-event CSV', () => {
  it('contains only the check-ins passed for that event', () => {
    const csv = checkinsCsv('evt-a', [c1]);
    expect(csv).toContain('evt-a');
    expect(csv).toContain('a@example.com');
    expect(csv).not.toContain('b@example.com');
    const other = checkinsCsv('evt-b', [c2]);
    expect(other).toContain('evt-b');
    expect(other).not.toContain('a@example.com');
  });

  it('exports winner history without deleting anything', () => {
    const draws: Draw[] = [
      {
        id: '1',
        personId: 'p1',
        displayName: 'A X.',
        invitedBy: 'X',
        prize: '',
        drawnAt: Timestamp.fromMillis(1),
        drawnBy: 'admin',
        status: 'no_show',
        resolvedAt: Timestamp.fromMillis(2),
      },
      {
        id: '2',
        personId: 'p2',
        displayName: 'B Y.',
        invitedBy: 'Y',
        prize: '',
        drawnAt: Timestamp.fromMillis(3),
        drawnBy: 'admin',
        status: 'claimed',
        resolvedAt: Timestamp.fromMillis(4),
      },
    ];
    const csv = winnersCsv('evt-a', draws);
    expect(csv).toContain('no_show');
    expect(csv).toContain('claimed');
    expect(csv).toContain('p1');
    expect(csv).toContain('p2');
  });
});
