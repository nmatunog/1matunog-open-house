import { beforeEach, describe, expect, it, vi } from 'vitest';

const setDoc = vi.hoisted(() => vi.fn(async () => {}));
const getDoc = vi.hoisted(() =>
  vi.fn(async (ref: { path: string }) => ({
    exists: () => ref.path.endsWith('guest-uid-1_booth-1'),
  })),
);

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
    doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
    getDocs: async () => ({
      docs: [
        { id: 'k1', data: () => ({ boothId: 'booth-1' }) },
        { id: 'k2', data: () => ({ boothId: 'booth-2' }) },
      ],
    }),
    getDoc,
    setDoc,
    serverTimestamp: () => 'SERVER_TIME',
  };
});

import { writeAdminStationStamps } from '../../src/lib/adminStamps';

describe('writeAdminStationStamps', () => {
  beforeEach(() => {
    setDoc.mockClear();
    getDoc.mockClear();
  });

  it('writes missing stations at the guest stamp path with source admin', async () => {
    const result = await writeAdminStationStamps({
      db: {} as never,
      eventId: 'evt-1',
      personId: 'p1',
      anonUid: 'guest-uid-1',
      boothIds: ['booth-1', 'booth-2'],
    });
    expect(result.already).toEqual(['booth-1']);
    expect(result.written).toEqual(['booth-2']);
    expect(setDoc).toHaveBeenCalledTimes(1);
    const [ref, payload] = setDoc.mock.calls[0] as [{ path: string }, Record<string, unknown>];
    expect(ref.path).toBe('oh_events/evt-1/stamps/guest-uid-1_booth-2');
    expect(payload).toMatchObject({
      boothId: 'booth-2',
      anonUid: 'guest-uid-1',
      personId: 'p1',
      stampKeyId: 'k2',
      source: 'admin',
      stampedAt: 'SERVER_TIME',
    });
  });
});
