import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_COPY, ADMIN_LOG } from '../../src/admin/adminCopy';
import { GuestListEmpty, HistoryEmpty, NoEventToday } from '../../src/admin/AdminEmptyStates';

const scenario = vi.hoisted(() => ({
  eventsError: null as Error | null,
  configError: null as Error | null,
  adminGetError: null as Error | null,
  adminDoc: { role: 'admin', active: true } as Record<string, unknown> | null,
  events: [] as Array<{ id: string; data: () => Record<string, unknown> }>,
  configExists: false,
  currentEventId: '',
  userEmail: 'nmatunog@gmail.com',
  emailVerified: true,
  checkins: [] as Array<{ id: string; data: () => Record<string, unknown> }>,
  stamps: [] as Array<{ id: string; data: () => Record<string, unknown> }>,
  draws: [] as Array<{ id: string; data: () => Record<string, unknown> }>,
}));

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
  getFirebase: () => ({ app: {}, auth: {}, db: {} }),
}));

vi.mock('../../src/lib/peopleSync', () => ({
  parsePerson: vi.fn(),
  syncEventCheckins: vi.fn(async () => ({ flags: [], synced: 0 })),
}));

vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class {},
  onAuthStateChanged: (_auth: unknown, cb: (user: unknown) => void) => {
    cb({
      uid: 'uid-nilo',
      email: scenario.userEmail,
      emailVerified: scenario.emailVerified,
    });
    return () => {};
  },
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
    collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
    getDoc: async (ref: { path: string }) => {
      if (scenario.adminGetError) throw scenario.adminGetError;
      if (ref.path.startsWith('oh_admins/')) {
        if (!scenario.adminDoc) return { exists: () => false, data: () => undefined };
        return { exists: () => true, data: () => scenario.adminDoc };
      }
      return { exists: () => false, data: () => undefined };
    },
    getDocs: async () => ({ docs: [] }),
    setDoc: vi.fn(async () => {}),
    updateDoc: vi.fn(async () => {}),
    deleteDoc: vi.fn(async () => {}),
    onSnapshot: (
      ref: { path: string },
      next: (snap: unknown) => void,
      onErr?: (err: Error) => void,
    ) => {
      const path = ref.path;
      if (path === 'oh_events') {
        if (scenario.eventsError) {
          onErr?.(scenario.eventsError);
          return () => {};
        }
        next({ docs: scenario.events });
        return () => {};
      }
      if (path === 'oh_config/public') {
        if (scenario.configError) {
          onErr?.(scenario.configError);
          return () => {};
        }
        next({
          exists: () => scenario.configExists,
          data: () => (scenario.configExists ? { currentEventId: scenario.currentEventId } : undefined),
        });
        return () => {};
      }
      if (path.endsWith('/checkins')) {
        next({ docs: scenario.checkins });
        return () => {};
      }
      if (path.endsWith('/stamps')) {
        next({ docs: scenario.stamps });
        return () => {};
      }
      if (path.endsWith('/draws')) {
        next({ docs: scenario.draws });
        return () => {};
      }
      next({ docs: [], exists: () => false, data: () => undefined });
      return () => {};
    },
  };
});

import { AdminApp } from '../../src/admin/AdminApp';

function renderAdmin() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <AdminApp />
    </MemoryRouter>,
  );
}

function ts(ms: number) {
  return { toDate: () => new Date(ms) };
}

function sampleEvent(id = 'evt-1') {
  const now = Date.now();
  return {
    id,
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
      booths: [{ id: 'booth-1', name: 'Products', codeHash: 'x' }],
      status: 'open',
      createdBy: 'nmatunog@gmail.com',
      pendingDrawNo: null,
      lastDrawNo: 0,
    }),
  };
}

describe('admin empty-state copy', () => {
  afterEach(() => {
    cleanup();
  });

  it('uses plain words, never a bare CMA', () => {
    const blob = JSON.stringify(ADMIN_COPY);
    expect(blob).not.toMatch(/\bCMA\b/);
    expect(blob).not.toMatch(/oh_events|oh_config|currentEventId|Firestore/i);
    render(<NoEventToday isAdmin onCreate={() => {}} />);
    expect(screen.getByRole('button', { name: ADMIN_COPY.createEvent })).toBeInTheDocument();
    expect(screen.getByText(ADMIN_COPY.todayEmptyTitle)).toBeInTheDocument();
    render(<GuestListEmpty hasEvent={false} />);
    expect(screen.getByText(ADMIN_COPY.guestEmptyNoEvent)).toBeInTheDocument();
    render(<HistoryEmpty hasEvent={false} />);
    expect(screen.getByText(ADMIN_COPY.historyEmptyNoEvent)).toBeInTheDocument();
  });
});

describe('AdminApp with an empty database', () => {
  beforeEach(() => {
    scenario.eventsError = null;
    scenario.configError = null;
    scenario.adminGetError = null;
    scenario.adminDoc = { role: 'admin', active: true };
    scenario.events = [];
    scenario.configExists = false;
    scenario.currentEventId = '';
    scenario.userEmail = 'nmatunog@gmail.com';
    scenario.emailVerified = true;
    scenario.checkins = [];
    scenario.stamps = [];
    scenario.draws = [];
  });

  afterEach(() => {
    cleanup();
  });

  it('shows a Create event empty state on Today, not a blank page', async () => {
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: ADMIN_COPY.createEvent })).toBeInTheDocument();
    });
    expect(screen.getByText(ADMIN_COPY.todayEmptyTitle)).toBeInTheDocument();
    expect(screen.getByText(ADMIN_COPY.todayEmptyBody)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\bCMA\b/);
  });

  it('opens the create-event form from the empty Today button', async () => {
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: ADMIN_COPY.createEvent })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: ADMIN_COPY.createEvent }));
    expect(screen.getByRole('heading', { name: 'New event' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save event' })).toBeInTheDocument();
  });

  it('shows empty states on Guest list and History when there is no event', async () => {
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: ADMIN_COPY.createEvent })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guest list' }));
    expect(screen.getByText(ADMIN_COPY.guestEmptyNoEvent)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    expect(screen.getByText(ADMIN_COPY.historyEmptyNoEvent)).toBeInTheDocument();
  });

  it('shows a plain-words load error and logs console.error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    scenario.eventsError = new Error('permission-denied');
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByText(ADMIN_COPY.loadErrorTitle)).toBeInTheDocument();
    });
    expect(screen.getByText(ADMIN_COPY.loadError)).toBeInTheDocument();
    expect(screen.queryByText(/permission-denied/)).toBeNull();
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls.some((args) => args[0] === ADMIN_LOG.events)).toBe(true);
  });

  it('still shows Create event when the admin role is written as Admin', async () => {
    scenario.adminDoc = { role: 'Admin', active: true };
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: ADMIN_COPY.createEvent })).toBeInTheDocument();
    });
  });

  it('shows a viewer empty state without Create event', async () => {
    scenario.adminDoc = { role: 'viewer', active: true };
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByText(ADMIN_COPY.todayEmptyTitle)).toBeInTheDocument();
    });
    expect(screen.getByText(ADMIN_COPY.todayEmptyViewer)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: ADMIN_COPY.createEvent })).toBeNull();
    expect(screen.queryByRole('button', { name: 'New event' })).toBeNull();
  });

  it('shows guest-list and history empty states when the event has no rows', async () => {
    scenario.events = [sampleEvent()];
    scenario.configExists = true;
    scenario.currentEventId = 'evt-1';
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByText('Start Draw')).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Guest list' })[0]!);
    expect(screen.getByText(ADMIN_COPY.guestEmptyNoGuests)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    expect(screen.getByText(ADMIN_COPY.historyEmptyNoDraws)).toBeInTheDocument();
  });

  it('shows Add stamps for an incomplete guest and hides it when they are Complete', async () => {
    const now = Date.now();
    scenario.events = [
      {
        id: 'evt-1',
        data: () => ({
          ...sampleEvent().data(),
          booths: [
            { id: 'booth-1', name: 'Products', codeHash: 'x' },
            { id: 'booth-2', name: 'Vitality', codeHash: 'x' },
          ],
        }),
      },
    ];
    scenario.configExists = true;
    scenario.currentEventId = 'evt-1';
    scenario.checkins = [
      {
        id: 'p-open',
        data: () => ({
          name: 'Maria Santos',
          email: 'maria@example.com',
          phone: '+639171234567',
          invitedBy: 'Ana',
          stampsCompleted: 0,
          checkedInAt: { toDate: () => new Date(now) },
          anonUid: 'guest-open',
          consentVersion: 'v1',
        }),
      },
      {
        id: 'p-done',
        data: () => ({
          name: 'Juan Cruz',
          email: 'juan@example.com',
          phone: '+639171234568',
          invitedBy: 'Ben',
          stampsCompleted: 0,
          checkedInAt: { toDate: () => new Date(now) },
          anonUid: 'guest-done',
          consentVersion: 'v1',
        }),
      },
    ];
    scenario.stamps = [
      {
        id: 'guest-done_booth-1',
        data: () => ({ boothId: 'booth-1', personId: 'p-done', anonUid: 'guest-done', stampKeyId: 'k1' }),
      },
      {
        id: 'guest-done_booth-2',
        data: () => ({ boothId: 'booth-2', personId: 'p-done', anonUid: 'guest-done', stampKeyId: 'k2' }),
      },
    ];
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByText('Start Draw')).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Guest list' })[0]!);
    expect(screen.getByText('Maria Santos')).toBeInTheDocument();
    expect(screen.getByText('Juan Cruz')).toBeInTheDocument();
    const addButtons = screen.getAllByRole('button', { name: ADMIN_COPY.addStamps });
    expect(addButtons).toHaveLength(1);
    fireEvent.click(addButtons[0]!);
    expect(screen.getByRole('button', { name: ADMIN_COPY.markAllStationsDone })).toBeInTheDocument();
    expect(screen.getByText(ADMIN_COPY.addStampsHint)).toBeInTheDocument();
  });

  it('shows a plain-words message if the admin listing cannot be read', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    scenario.adminGetError = new Error('unavailable');
    renderAdmin();
    await waitFor(() => {
      expect(screen.getByText(ADMIN_COPY.authCheckError)).toBeInTheDocument();
    });
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls.some((args) => args[0] === ADMIN_LOG.auth)).toBe(true);
  });
});
