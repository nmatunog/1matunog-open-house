import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GUEST_SESSION_LOST_MESSAGE,
  STAMPS_LOADING_MESSAGE,
  STAMPS_REFRESH_NOTE,
} from '../../src/guest/guestStamps';
import { saveDeviceCheckin, saveGuestProfile, saveStampBoothIds } from '../../src/lib/storage';

const scenario = vi.hoisted(() => {
  let stampRelease: (() => void) | undefined;
  return {
    existingBooths: ['booth-1', 'booth-2', 'booth-3'] as string[],
    stampError: false,
    currentUser: { uid: 'anon-1' } as { uid: string } | null,
    authReady: Promise.resolve(),
    stampReads: new Promise<void>((resolve) => {
      stampRelease = resolve;
    }),
    releaseStampReads() {
      stampRelease?.();
    },
    resetGates() {
      this.stampReads = new Promise<void>((resolve) => {
        stampRelease = resolve;
      });
      this.existingBooths = ['booth-1', 'booth-2', 'booth-3'];
      this.stampError = false;
      this.authReady = Promise.resolve();
      this.currentUser = { uid: 'anon-1' };
    },
  };
});

vi.mock('../../src/firebase/config', () => ({
  readFirebaseWebConfig: () => ({
    apiKey: 'test',
    authDomain: 'localhost',
    projectId: 'test',
    storageBucket: 'test',
    messagingSenderId: '0',
    appId: 'test',
  }),
  firebaseConfigReady: () => true,
}));

vi.mock('../../src/firebase/app', () => ({
  getFirebase: () => ({
    app: {},
    auth: {
      get currentUser() {
        return scenario.currentUser;
      },
      authStateReady: () => scenario.authReady,
    },
    db: {},
  }),
}));

vi.mock('firebase/auth', () => ({
  signInAnonymously: vi.fn(async () => ({ user: { uid: 'anon-1' } })),
}));

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    doc: (_db: unknown, ...segments: string[]) => ({
      path: segments.join('/'),
      id: segments[segments.length - 1],
    }),
    collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
    getDocs: async () => ({ docs: [] }),
    getDoc: async (ref: { path: string }) => {
      if (ref.path === 'oh_events/evt-1') {
        const now = Date.now();
        const ts = (ms: number) => ({ toDate: () => new Date(ms) });
        return {
          id: 'evt-1',
          exists: () => true,
          data: () => ({
            name: 'Open House',
            venue: 'Cebu',
            eventDate: '2099-01-01',
            checkInOpensAt: ts(now - 3_600_000),
            checkInClosesAt: ts(now + 3_600_000),
            raffle: {
              opensAt: ts(now - 3_600_000),
              closesAt: ts(now + 3_600_000),
              minStamps: 1,
              allowRepeatWinners: false,
              prizes: [],
            },
            booths: [1, 2, 3, 4, 5, 6].map((n) => ({
              id: `booth-${n}`,
              name: `Station ${n} name`,
              codeHash: 'x',
            })),
            status: 'open',
            createdBy: 'host@example.com',
            pendingDrawNo: null,
            lastDrawNo: 0,
          }),
        };
      }
      if (ref.path.startsWith('oh_events/evt-1/stamps/')) {
        if (scenario.stampError) throw new Error('permission-denied');
        await scenario.stampReads;
        const stampId = ref.path.split('/').pop() ?? '';
        const boothId = stampId.replace(/^anon-1_/, '');
        const exists = scenario.existingBooths.includes(boothId);
        return {
          exists: () => exists,
          data: () =>
            exists
              ? { boothId, personId: 'person-1', anonUid: 'anon-1', stampKeyId: 'a'.repeat(64) }
              : undefined,
        };
      }
      return { exists: () => false, data: () => undefined };
    },
    setDoc: vi.fn(async () => {}),
    onSnapshot: (ref: { path: string }, next: (snap: { exists: () => boolean; data: () => { currentEventId?: string } }) => void) => {
      if (ref.path === 'oh_config/public') {
        next({ exists: () => true, data: () => ({ currentEventId: 'evt-1' }) });
      }
      return () => {};
    },
    serverTimestamp: () => ({ _st: true }),
  };
});

import { GuestApp } from '../../src/guest/GuestApp';

function renderPassport() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<GuestApp />} />
      </Routes>
    </MemoryRouter>,
  );
}

function seedCheckedInGuest(args?: { anonUid?: string; stamps?: string[] }) {
  saveDeviceCheckin({
    eventId: 'evt-1',
    personId: 'person-1',
    name: 'Juan Dela Cruz',
    anonUid: args?.anonUid ?? 'anon-1',
  });
  saveGuestProfile({
    name: 'Juan Dela Cruz',
    email: 'juan@example.com',
    phone: '+639171234567',
    invitedBy: 'Ana',
    privacyAgreed: true,
    marketingOptIn: false,
  });
  if (args?.stamps) saveStampBoothIds('evt-1', 'person-1', args.stamps);
}

describe('guest passport keeps saved stamps on refresh', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    scenario.resetGates();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows saved stamps immediately before server reads finish', async () => {
    seedCheckedInGuest({ stamps: ['booth-1', 'booth-2', 'booth-3'] });
    renderPassport();

    expect(await screen.findByText(/3 of 6/)).toBeInTheDocument();
    expect(screen.queryByText(STAMPS_LOADING_MESSAGE)).toBeNull();
    expect(screen.getByText('Station 1 name')).toBeInTheDocument();

    await act(async () => {
      scenario.releaseStampReads();
    });
    await waitFor(() => {
      expect(screen.getByText(/3 of 6/)).toBeInTheDocument();
    });
    expect(screen.queryByText(STAMPS_REFRESH_NOTE)).toBeNull();
  });

  it('keeps saved stamps and shows a note when server lookups fail', async () => {
    scenario.stampError = true;
    seedCheckedInGuest({ stamps: ['booth-1', 'booth-2'] });
    renderPassport();

    expect(await screen.findByText(/2 of 6/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(STAMPS_REFRESH_NOTE)).toBeInTheDocument();
    });
    expect(screen.getByText(/2 of 6/)).toBeInTheDocument();
    expect(screen.queryByText(STAMPS_LOADING_MESSAGE)).toBeNull();
  });

  it('warns when the anonymous session no longer matches check-in', async () => {
    scenario.currentUser = { uid: 'brand-new-uid' };
    seedCheckedInGuest({ anonUid: 'old-uid', stamps: ['booth-1'] });
    renderPassport();

    expect(await screen.findByText(GUEST_SESSION_LOST_MESSAGE)).toBeInTheDocument();
    expect(screen.getByText(/1 of 6/)).toBeInTheDocument();
    await act(async () => {
      scenario.releaseStampReads();
    });
    expect(screen.getByText(GUEST_SESSION_LOST_MESSAGE)).toBeInTheDocument();
    expect(screen.getByText(/1 of 6/)).toBeInTheDocument();
  });
});
