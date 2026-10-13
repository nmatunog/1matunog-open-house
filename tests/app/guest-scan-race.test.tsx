import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STAMPS_LOADING_MESSAGE } from '../../src/guest/guestStamps';
import { saveDeviceCheckin, saveGuestProfile } from '../../src/lib/storage';

const scenario = vi.hoisted(() => {
  let stampRelease: (() => void) | undefined;
  let applyRelease: (() => void) | undefined;
  return {
    existingBooths: ['booth-1', 'booth-2', 'booth-3'] as string[],
    applyBoothId: 'booth-4',
    getDocsCalls: [] as string[],
    authReady: Promise.resolve(),
    currentUser: { uid: 'anon-1' } as { uid: string } | null,
    stampReads: new Promise<void>((resolve) => {
      stampRelease = resolve;
    }),
    applyWrites: new Promise<void>((resolve) => {
      applyRelease = resolve;
    }),
    releaseStampReads() {
      stampRelease?.();
    },
    releaseApply() {
      applyRelease?.();
    },
    resetGates() {
      this.stampReads = new Promise<void>((resolve) => {
        stampRelease = resolve;
      });
      this.applyWrites = new Promise<void>((resolve) => {
        applyRelease = resolve;
      });
      this.getDocsCalls = [];
      this.existingBooths = ['booth-1', 'booth-2', 'booth-3'];
      this.applyBoothId = 'booth-4';
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

vi.mock('../../src/guest/applyStamp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/guest/applyStamp')>();
  return {
    ...actual,
    applyStationStamp: vi.fn(async () => {
      await scenario.applyWrites;
      return {
        ok: true as const,
        status: 'stamped' as const,
        boothId: scenario.applyBoothId,
        stampKeyId: 'a'.repeat(64),
      };
    }),
  };
});

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    doc: (_db: unknown, ...segments: string[]) => ({
      path: segments.join('/'),
      id: segments[segments.length - 1],
    }),
    collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
    getDocs: async (ref: { path: string }) => {
      scenario.getDocsCalls.push(ref.path);
      return { docs: [] };
    },
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
    onSnapshot: () => () => {},
    serverTimestamp: () => ({ _st: true }),
  };
});

import { GuestApp } from '../../src/guest/GuestApp';

function renderScan() {
  return render(
    <MemoryRouter initialEntries={['/s/evt-1/token-four']}>
      <Routes>
        <Route path="/s/:eventId/:token" element={<GuestApp />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('QR scan progress race on a fresh tab', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    scenario.resetGates();
    saveDeviceCheckin({ eventId: 'evt-1', personId: 'person-1', name: 'Juan Dela Cruz' });
    saveGuestProfile({
      name: 'Juan Dela Cruz',
      email: 'juan@example.com',
      phone: '+639171234567',
      invitedBy: 'Ana',
      privacyAgreed: true,
      marketingOptIn: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('shows loading, never 1 of 6, then Station 4 stamped and 4 of 6', async () => {
    renderScan();

    expect(await screen.findByText(STAMPS_LOADING_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(/1 of 6/)).toBeNull();
    expect(screen.queryByText(/0 of 6/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/\bCMA\b/);

    await act(async () => {
      scenario.releaseStampReads();
      await Promise.resolve();
    });
    expect(screen.getByText(STAMPS_LOADING_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(/1 of 6/)).toBeNull();
    expect(screen.queryByText(/3 of 6/)).toBeNull();

    await act(async () => {
      scenario.releaseApply();
    });
    await waitFor(() => {
      expect(screen.getByText('Station 4 stamped!')).toBeInTheDocument();
    });
    expect(screen.getByText('4 of 6')).toBeInTheDocument();
    expect(screen.queryByText(STAMPS_LOADING_MESSAGE)).toBeNull();
    expect(screen.queryByText(/1 of 6/)).toBeNull();
    expect(scenario.getDocsCalls).toEqual([]);
  });

  it('waits for restored anonymous auth before reading stamps from a camera-app load', async () => {
    let finishAuth: () => void = () => {};
    scenario.currentUser = null;
    scenario.authReady = new Promise<void>((resolve) => {
      finishAuth = () => {
        scenario.currentUser = { uid: 'anon-1' };
        resolve();
      };
    });

    renderScan();
    expect(await screen.findByText(STAMPS_LOADING_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(/1 of 6/)).toBeNull();

    await act(async () => {
      finishAuth();
      scenario.releaseStampReads();
      scenario.releaseApply();
    });

    await waitFor(() => {
      expect(screen.getByText('4 of 6')).toBeInTheDocument();
    });
    expect(screen.getByText('Station 4 stamped!')).toBeInTheDocument();
    expect(screen.queryByText(/1 of 6/)).toBeNull();
  });
});
