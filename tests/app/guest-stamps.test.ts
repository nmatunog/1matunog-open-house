import { describe, expect, it, vi } from 'vitest';
import { stampDocId } from '../../src/lib/stations';
import {
  GUEST_SESSION_LOST_MESSAGE,
  STAMPS_LOADING_MESSAGE,
  STAMPS_REFRESH_NOTE,
  loadStampBoothIdsFromDocs,
  mergeStationIds,
  scopedStampBoothIds,
  stampProgressFromDocs,
  uniqueStationIds,
  waitForGuestUid,
} from '../../src/guest/guestStamps';

vi.mock('firebase/auth', () => ({
  signInAnonymously: vi.fn(async () => ({ user: { uid: 'brand-new-uid' } })),
}));

import { signInAnonymously } from 'firebase/auth';

const sixBooths = [1, 2, 3, 4, 5, 6].map((n) => ({ id: `booth-${n}` }));

function delayedReader(existing: string[], gate: Promise<void>) {
  return async (stampId: string) => {
    await gate;
    const boothId = sixBooths.find((b) => stampDocId('anon-1', b.id) === stampId)?.id;
    return {
      exists: Boolean(boothId && existing.includes(boothId)),
      boothId,
      personId: 'p1',
    };
  };
}

describe('guest stamp progress from documents', () => {
  it('uses the locked loading copy', () => {
    expect(STAMPS_LOADING_MESSAGE).toBe('Loading your stamps…');
    expect(STAMPS_LOADING_MESSAGE).not.toMatch(/\bCMA\b/);
    expect(STAMPS_REFRESH_NOTE).toBe("Couldn't refresh stamps — showing saved ones.");
    expect(GUEST_SESSION_LOST_MESSAGE).toBe(
      'This browser lost your session — open the passport in the same browser you checked in with, or see a host.',
    );
  });

  it('counts unique stations only', () => {
    expect(uniqueStationIds(['booth-1', 'booth-2', 'booth-1', 'booth-3'])).toEqual([
      'booth-1',
      'booth-2',
      'booth-3',
    ]);
    expect(mergeStationIds(['booth-1', 'booth-2'], ['booth-2', 'booth-4'])).toEqual([
      'booth-1',
      'booth-2',
      'booth-4',
    ]);
  });

  it('does not keep in-memory stamps from another event or person', () => {
    expect(
      scopedStampBoothIds({
        booths: sixBooths,
        savedIds: ['booth-1'],
        inMemoryIds: ['booth-2', 'booth-3', 'ghost-booth'],
        sameOwner: false,
      }),
    ).toEqual(['booth-1']);
    expect(
      scopedStampBoothIds({
        booths: sixBooths,
        savedIds: ['booth-1'],
        inMemoryIds: ['booth-2', 'ghost-booth'],
        sameOwner: true,
      }),
    ).toEqual(['booth-2', 'booth-1']);
  });

  it('hides progress until stamp documents have loaded', () => {
    expect(
      stampProgressFromDocs({
        loaded: false,
        stampBoothIds: [],
        justAppliedBoothId: 'booth-4',
      }),
    ).toEqual({ loading: true });
  });

  it('never reports fewer stations than the stamp documents already loaded', () => {
    const loaded = ['booth-1', 'booth-2', 'booth-3'];
    const shown = stampProgressFromDocs({
      loaded: true,
      stampBoothIds: loaded,
      justAppliedBoothId: 'booth-4',
    });
    expect(shown.loading).toBe(false);
    if (shown.loading) return;
    expect(shown.doneCount).toBeGreaterThanOrEqual(loaded.length);
    expect(shown.doneCount).toBe(4);
    expect(shown.boothIds).toEqual(['booth-1', 'booth-2', 'booth-3', 'booth-4']);
  });

  it('does not let a just-applied station display 1 of 6 while older docs are in flight', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const load = loadStampBoothIdsFromDocs({
      booths: sixBooths,
      anonUid: 'anon-1',
      personId: 'p1',
      readStamp: delayedReader(['booth-1', 'booth-2', 'booth-3'], gate),
    });

    const whileWaiting = stampProgressFromDocs({
      loaded: false,
      stampBoothIds: [],
      justAppliedBoothId: 'booth-4',
    });
    expect(whileWaiting).toEqual({ loading: true });

    release();
    const found = await load;
    expect(found.boothIds).toEqual(['booth-1', 'booth-2', 'booth-3']);
    expect(found.failed).toBe(false);
    expect(found.failedBoothIds).toEqual([]);

    const shown = stampProgressFromDocs({
      loaded: true,
      stampBoothIds: found.boothIds,
      justAppliedBoothId: 'booth-4',
    });
    expect(shown).toEqual({
      loading: false,
      boothIds: ['booth-1', 'booth-2', 'booth-3', 'booth-4'],
      doneCount: 4,
    });
  });

  it('reads each stamp by document id so guests never need a list query', async () => {
    const seen: string[] = [];
    await loadStampBoothIdsFromDocs({
      booths: [{ id: 'booth-1' }, { id: 'booth-2' }],
      anonUid: 'anon-1',
      personId: 'p1',
      readStamp: async (stampId) => {
        seen.push(stampId);
        return { exists: false };
      },
    });
    expect(seen).toEqual(['anon-1_booth-1', 'anon-1_booth-2']);
  });

  it('ignores a stamp document that belongs to a different person', async () => {
    const found = await loadStampBoothIdsFromDocs({
      booths: sixBooths,
      anonUid: 'anon-1',
      personId: 'p1',
      readStamp: async (stampId) => ({
        exists: stampId === 'anon-1_booth-2',
        boothId: 'booth-2',
        personId: 'someone-else',
      }),
    });
    expect(found.boothIds).toEqual([]);
    expect(found.failed).toBe(false);
  });

  it('keeps found stamps when some lookups fail', async () => {
    const found = await loadStampBoothIdsFromDocs({
      booths: sixBooths,
      anonUid: 'anon-1',
      personId: 'p1',
      readStamp: async (stampId) => {
        if (stampId.endsWith('booth-3')) throw new Error('permission-denied');
        const boothId = sixBooths.find((b) => stampDocId('anon-1', b.id) === stampId)?.id;
        return {
          exists: boothId === 'booth-1' || boothId === 'booth-2',
          boothId,
          personId: 'p1',
        };
      },
    });
    expect(found.boothIds).toEqual(['booth-1', 'booth-2']);
    expect(found.failedBoothIds).toEqual(['booth-3']);
    expect(found.failed).toBe(true);
  });
});

describe('anonymous auth restore before stamp reads', () => {
  it('uses the restored uid and does not sign in a new guest', async () => {
    const signIn = vi.mocked(signInAnonymously);
    signIn.mockClear();
    let finishRestore: () => void = () => {};
    const auth = {
      currentUser: null as { uid: string } | null,
      authStateReady: () =>
        new Promise<void>((resolve) => {
          finishRestore = () => {
            auth.currentUser = { uid: 'restored-uid' };
            resolve();
          };
        }),
    };

    const pending = waitForGuestUid(auth);
    expect(signIn).not.toHaveBeenCalled();
    finishRestore();
    await expect(pending).resolves.toBe('restored-uid');
    expect(signIn).not.toHaveBeenCalled();
  });

  it('signs in only after restore finds no user', async () => {
    const signIn = vi.mocked(signInAnonymously);
    signIn.mockClear();
    const auth = {
      currentUser: null,
      authStateReady: async () => {},
    };
    await expect(waitForGuestUid(auth)).resolves.toBe('brand-new-uid');
    expect(signIn).toHaveBeenCalledTimes(1);
  });
});
