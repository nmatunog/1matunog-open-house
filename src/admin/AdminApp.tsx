import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, Route, Routes, useNavigate } from 'react-router-dom';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { MoreDetails } from '../components/MoreDetails';
import { FieldError, fieldClass } from '../components/FieldError';
import { ProjectorName } from '../components/ProjectorName';
import { SafeText } from '../components/SafeText';
import { getFirebase } from '../firebase/app';
import { firebaseConfigReady, readFirebaseWebConfig } from '../firebase/config';
import { boothsFromLastEvent, type BoothDraft } from '../lib/booths';
import { checkinsCsv, downloadCsv, peopleCsv, winnersCsv } from '../lib/csv';
import { projectorName } from '../lib/displayName';
import { eligiblePool, eventCheckInOpen, guestListStatus, raffleWindowOpen, statusLabel } from '../lib/eligibility';
import { openCheckInNowPatch } from '../lib/openCheckIn';
import { parsePerson, syncEventCheckins } from '../lib/peopleSync';
import { drawAndLock, loadLivePool, parseCheckin, parseDraw, resolvePendingDraw } from '../lib/raffle';
import { DRAW_HINT } from '../lib/reel';
import {
  buildStationMaterials,
  countStampsByBooth,
  countUniqueStationsByPerson,
  parseStamp,
  rotateStationMaterials,
  writeStationMaterials,
} from '../lib/stations';
import { boothIdsDoneForPerson, shouldShowAddStamps } from '../lib/adminStamps';
import { detailsFromEvent, eventDetailsUpdate } from '../lib/eventDetails';
import { formatManilaDate, formatManilaTime, manilaDateTimeToDate, todayYmdManila, toDate } from '../lib/time';
import type { AdminProfile, Checkin, Draw, DuplicateFlag, OhEvent, Person, StationStamp } from '../types';
import { ADMIN_COPY, ADMIN_LOG } from './adminCopy';
import { AddStampsPanel } from './AddStampsPanel';
import { AdminLoadError, AdminLoading, GuestListEmpty, HistoryEmpty, NoEventToday } from './AdminEmptyStates';
import { eventsFromSnapshot, readAdminRole } from './eventsFromSnapshot';
import { PrintStationCards } from './PrintStationCards';
import { ProjectorReel } from './ProjectorReel';
import { CentralCheckinQr } from './CentralCheckinQr';

type Screen = 'today' | 'list' | 'guest' | 'history' | 'new' | 'more';

export function AdminApp() {
  const configOk = firebaseConfigReady(readFirebaseWebConfig());
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AdminProfile | null | 'missing' | 'unverified'>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    if (!configOk) return;
    const { auth } = getFirebase();
    return onAuthStateChanged(auth, async (next) => {
      setUser(next);
      if (!next || !next.email) {
        setProfile(null);
        setAuthReady(true);
        return;
      }
      if (next.emailVerified !== true) {
        setProfile('unverified');
        setAuthReady(true);
        return;
      }
      const email = next.email.toLowerCase();
      const { db } = getFirebase();
      try {
        const snap = await getDoc(doc(db, 'oh_admins', email));
        if (!snap.exists() || snap.data()?.active !== true) {
          setProfile('missing');
        } else {
          setProfile({ uid: next.uid, email, role: readAdminRole(snap.data()?.role), active: true });
        }
      } catch (err) {
        console.error(ADMIN_LOG.auth, err);
        setAuthError(ADMIN_COPY.authCheckError);
        setProfile(null);
      }
      setAuthReady(true);
    });
  }, [configOk]);

  async function signIn() {
    setAuthError('');
    try {
      const { auth } = getFirebase();
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign-in failed');
    }
  }

  if (!configOk) {
    return (
      <AdminShell>
        <p className="p-6">Firebase settings are missing. Copy .env.example to .env.local.</p>
      </AdminShell>
    );
  }

  if (!authReady) {
    return (
      <AdminShell>
        <p className="p-6">Loading…</p>
      </AdminShell>
    );
  }

  if (!user || profile === null) {
    return (
      <AdminShell>
        <div className="mx-auto max-w-md p-6 space-y-4">
          <h1 className="text-2xl font-black">Open House Admin</h1>
          <p className="text-gray-600">Sign in with Google. Only listed emails can continue.</p>
          <button type="button" onClick={() => void signIn()} className="w-full rounded-2xl bg-brand py-4 font-bold text-white">
            Sign in with Google
          </button>
          {authError ? <p className="text-sm text-red-600">{authError}</p> : null}
          <Link to="/" className="block text-center text-sm text-gray-500 underline">
            Back to guest passport
          </Link>
        </div>
      </AdminShell>
    );
  }

  if (profile === 'unverified') {
    return (
      <AdminShell>
        <div className="mx-auto max-w-md p-6 space-y-4">
          <h1 className="text-2xl font-black">Verify your Google email</h1>
          <p>
            You signed in as {user.email}, but that Google account has not verified the email address.
            Open House admin access needs a verified Google email plus an active listing in oh_admins.
          </p>
          <button type="button" className="rounded-xl bg-gray-900 px-4 py-2 text-white" onClick={() => void signOut(getFirebase().auth)}>
            Sign out
          </button>
        </div>
      </AdminShell>
    );
  }

  if (profile === 'missing' || (typeof profile === 'object' && !profile.active)) {
    return (
      <AdminShell>
        <div className="mx-auto max-w-md p-6 space-y-4">
          <h1 className="text-2xl font-black">Not on the list</h1>
          <p>You signed in as {user.email}, but that email is not an Open House admin yet. Ask Nilo to add it in the Firebase console under oh_admins.</p>
          <button type="button" className="rounded-xl bg-gray-900 px-4 py-2 text-white" onClick={() => void signOut(getFirebase().auth)}>
            Sign out
          </button>
        </div>
      </AdminShell>
    );
  }

  return (
    <Routes>
      <Route path="draw" element={<DrawRoute profile={profile} />} />
      <Route path="print/:eventId" element={<PrintStationCards />} />
      <Route path="*" element={<AdminHome profile={profile} />} />
    </Routes>
  );
}

function AdminShell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-gray-100">{children}</div>;
}

function AdminHome({ profile }: { profile: AdminProfile }) {
  const navigate = useNavigate();
  const isAdmin = profile.role === 'admin';
  const [screen, setScreen] = useState<Screen>('today');
  const [events, setEvents] = useState<OhEvent[]>([]);
  const [currentId, setCurrentId] = useState<string>('');
  const [eventId, setEventId] = useState<string>('');
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [stamps, setStamps] = useState<StationStamp[]>([]);
  const [draws, setDraws] = useState<Draw[]>([]);
  const [flags, setFlags] = useState<DuplicateFlag[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<Checkin | null>(null);
  const [syncNote, setSyncNote] = useState('');
  const [eventsReady, setEventsReady] = useState(false);
  const [configReady, setConfigReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [editingEvent, setEditingEvent] = useState<OhEvent | null>(null);

  useEffect(() => {
    const { db } = getFirebase();
    const unsubEvents = onSnapshot(
      collection(db, 'oh_events'),
      (snap) => {
        try {
          setEvents(
            eventsFromSnapshot(snap.docs.map((d) => ({ id: d.id, data: () => d.data() as Record<string, unknown> }))),
          );
          setEventsReady(true);
        } catch (err) {
          console.error(ADMIN_LOG.events, err);
          setLoadError(ADMIN_COPY.loadError);
          setEventsReady(true);
        }
      },
      (err) => {
        console.error(ADMIN_LOG.events, err);
        setLoadError(ADMIN_COPY.loadError);
        setEventsReady(true);
      },
    );
    const unsubCfg = onSnapshot(
      doc(db, 'oh_config', 'public'),
      (snap) => {
        if (snap.exists()) {
          const id = String((snap.data() as { currentEventId?: string }).currentEventId ?? '');
          setCurrentId(id);
          setEventId((prev) => prev || id);
        }
        setConfigReady(true);
      },
      (err) => {
        console.error(ADMIN_LOG.config, err);
        setLoadError((prev) => prev || ADMIN_COPY.loadError);
        setConfigReady(true);
      },
    );
    return () => {
      unsubEvents();
      unsubCfg();
    };
  }, []);

  const event = events.find((e) => e.id === eventId) ?? events[0] ?? null;
  const selectedEventId = event?.id;

  useEffect(() => {
    if (!selectedEventId) return;
    const { db } = getFirebase();
    const unsubC = onSnapshot(
      collection(db, 'oh_events', selectedEventId, 'checkins'),
      (snap) => {
        setCheckins(snap.docs.map((d) => parseCheckin(d.id, d.data() as Record<string, unknown>)));
      },
      (err) => {
        console.error(ADMIN_LOG.checkins, err);
        setLoadError(ADMIN_COPY.loadError);
      },
    );
    const unsubS = onSnapshot(
      collection(db, 'oh_events', selectedEventId, 'stamps'),
      (snap) => {
        setStamps(snap.docs.map((d) => parseStamp(d.id, d.data() as Record<string, unknown>)));
      },
      (err) => {
        console.error(ADMIN_LOG.stamps, err);
        setLoadError(ADMIN_COPY.loadError);
      },
    );
    const unsubD = onSnapshot(
      collection(db, 'oh_events', selectedEventId, 'draws'),
      (snap) => {
        const list = snap.docs.map((d) => parseDraw(d.id, d.data() as Record<string, unknown>));
        list.sort((a, b) => Number(a.id) - Number(b.id));
        setDraws(list);
      },
      (err) => {
        console.error(ADMIN_LOG.draws, err);
        setLoadError(ADMIN_COPY.loadError);
      },
    );
    return () => {
      unsubC();
      unsubS();
      unsubD();
    };
  }, [selectedEventId]);

  useEffect(() => {
    if (!selectedEventId || profile.role === 'viewer') return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await syncEventCheckins(getFirebase().db, selectedEventId);
        if (!cancelled) {
          setFlags(result.flags);
          setSyncNote(`People list updated (${result.synced} check-ins).`);
        }
      } catch {
        if (!cancelled) setSyncNote('Could not update the people list.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedEventId, checkins.length, profile.role]);

  const winners = useMemo(() => {
    const map = new Map<string, { personId: string; drawNo: number; status: Draw['status'] }>();
    for (const d of draws) {
      map.set(d.personId, { personId: d.personId, drawNo: Number(d.id), status: d.status });
    }
    return map;
  }, [draws]);

  const stampCounts = useMemo(() => countUniqueStationsByPerson(stamps), [stamps]);
  const boothStampCounts = useMemo(() => countStampsByBooth(stamps), [stamps]);
  const checkinsCounted = useMemo(
    () => checkins.map((c) => ({ ...c, stampsCompleted: stampCounts.get(c.personId) ?? 0 })),
    [checkins, stampCounts],
  );
  const canWin = event ? eligiblePool(checkins, event, winners, stampCounts) : [];
  const pending = event && event.pendingDrawNo != null ? draws.find((d) => d.id === String(event.pendingDrawNo)) : null;
  const ready = eventsReady && configReady;

  return (
    <AdminShell>
      <header className="bg-brand text-white">
        <div className="mx-auto flex max-w-5xl items-start justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-widest opacity-80">1Matunog District</p>
            <h1 className="text-lg font-bold">Open House Admin</h1>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg bg-white/15 px-3 py-1 text-xs font-semibold"
            onClick={() => void signOut(getFirebase().auth)}
          >
            Sign out
          </button>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-3 overflow-x-auto px-4 pb-3 text-sm">
          <NavBtn onClick={() => setScreen('today')} active={screen === 'today'}>
            Today
          </NavBtn>
          <NavBtn onClick={() => setScreen('list')} active={screen === 'list'}>
            Guest list
          </NavBtn>
          <NavBtn onClick={() => setScreen('history')} active={screen === 'history'}>
            History
          </NavBtn>
          {isAdmin ? (
            <NavBtn
              onClick={() => {
                setEditingEvent(null);
                setScreen('new');
              }}
              active={screen === 'new' && !editingEvent}
            >
              New event
            </NavBtn>
          ) : null}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl p-4 pb-16">
        {loadError ? <AdminLoadError message={loadError} /> : null}
        {!loadError && !ready ? <AdminLoading /> : null}
        {!loadError && ready && screen === 'today' && !event ? (
          <NoEventToday isAdmin={isAdmin} onCreate={() => setScreen('new')} />
        ) : null}
        {!loadError && ready && screen === 'today' && event ? (
          <TodayScreen
            events={events}
            event={event}
            currentId={currentId}
            isAdmin={isAdmin}
            checkins={checkinsCounted}
            boothStampCounts={boothStampCounts}
            canWinCount={canWin.length}
            pending={pending ?? null}
            onPick={setEventId}
            onOpenDraw={() => navigate(`/admin/draw?event=${event.id}`)}
            onPrintCards={() => navigate(`/admin/print/${event.id}`)}
            onGuestList={() => setScreen('list')}
            onEdit={() => {
              setEditingEvent(event);
              setScreen('new');
            }}
            flags={flags}
            syncNote={syncNote}
          />
        ) : null}
        {!loadError && ready && screen === 'list' && !event ? <GuestListEmpty hasEvent={false} /> : null}
        {!loadError && ready && screen === 'list' && event ? (
          <GuestListScreen
            event={event}
            checkins={checkinsCounted}
            stamps={stamps}
            isAdmin={isAdmin}
            onSelect={(c) => {
              setSelectedPerson(c);
              setScreen('guest');
            }}
          />
        ) : null}
        {!loadError && ready && screen === 'guest' && event && selectedPerson ? (
          <GuestDetailScreen
            event={event}
            checkin={selectedPerson}
            stampCount={stampCounts.get(selectedPerson.personId) ?? 0}
            isAdmin={isAdmin}
            onBack={() => setScreen('list')}
          />
        ) : null}
        {!loadError && ready && screen === 'history' && !event ? <HistoryEmpty hasEvent={false} /> : null}
        {!loadError && ready && screen === 'history' && event ? <HistoryScreen event={event} draws={draws} /> : null}
        {!loadError && ready && screen === 'new' && isAdmin ? (
          <NewEventScreen
            key={editingEvent?.id ?? 'new'}
            last={events[0] ?? null}
            existing={editingEvent}
            profile={profile}
            onSaved={(id) => {
              setEventId(id);
              setEditingEvent(null);
              setScreen('today');
            }}
          />
        ) : null}
        {isAdmin ? (
          <MoreDetails title="More details">
            <PeopleTools flags={flags} people={people} setPeople={setPeople} />
          </MoreDetails>
        ) : null}
      </main>
    </AdminShell>
  );
}

function NavBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-full px-3 py-1 ${active ? 'bg-white text-brand' : 'bg-white/15'}`}
    >
      {children}
    </button>
  );
}

function TodayScreen({
  events,
  event,
  currentId,
  isAdmin,
  checkins,
  boothStampCounts,
  canWinCount,
  pending,
  onPick,
  onOpenDraw,
  onPrintCards,
  onGuestList,
  onEdit,
  flags,
  syncNote,
}: {
  events: OhEvent[];
  event: OhEvent;
  currentId: string;
  isAdmin: boolean;
  checkins: Checkin[];
  boothStampCounts: Map<string, number>;
  canWinCount: number;
  pending: Draw | null;
  onPick: (id: string) => void;
  onOpenDraw: () => void;
  onPrintCards: () => void;
  onGuestList: () => void;
  onEdit: () => void;
  flags: DuplicateFlag[];
  syncNote: string;
}) {
  const open = eventCheckInOpen(event);
  const [rotateNote, setRotateNote] = useState('');
  const [overrideError, setOverrideError] = useState('');
  const [overrideBusy, setOverrideBusy] = useState(false);
  async function toggleBoothRequirement() {
    if (!isAdmin || overrideBusy || pending) return;
    const next = event.boothScanRequirementSuspended !== true;
    if (!confirm(next
      ? 'Suspend station scans? All checked-in guests will enter the raffle, subject to existing winner restrictions.'
      : 'Restore station scans? Only guests completing every station will enter the raffle.')) return;
    setOverrideBusy(true); setOverrideError('');
    try {
      const db = getFirebase().db;
      await runTransaction(db, async (tx) => {
        const eventRef = doc(db, 'oh_events', event.id);
        const current = await tx.get(eventRef);
        if (!current.exists()) throw new Error('Event not found');
        const data = current.data();
        if (data.pendingDrawNo != null) throw new Error('Finish the current winner before changing requirements.');
        if ((data.boothScanRequirementSuspended === true) !== !next) throw new Error('Setting changed in another session. Refresh and try again.');
        const previousAudit = Array.isArray(data.boothScanRequirementAudit) ? data.boothScanRequirementAudit : [];
        tx.update(eventRef, {
          boothScanRequirementSuspended: next,
          boothScanRequirementAudit: [
            ...previousAudit.slice(-49),
            {
              previousValue: !next,
              newValue: next,
              changedAt: Timestamp.now(),
              changedBy: getFirebase().auth.currentUser?.email?.toLowerCase() ?? 'unknown',
            },
          ],
        });
      });
    } catch (err) {
      setOverrideError(err instanceof Error ? err.message : 'Could not change station requirement');
    } finally { setOverrideBusy(false); }
  }
  async function setCurrent() {
    await setDoc(doc(getFirebase().db, 'oh_config', 'public'), { currentEventId: event.id }, { merge: true });
  }
  async function setStatus(status: OhEvent['status']) {
    await updateDoc(doc(getFirebase().db, 'oh_events', event.id), { status });
  }
  async function openCheckInNow() {
    if (!confirm(ADMIN_COPY.openCheckInNowConfirm)) return;
    const now = new Date();
    const patch = openCheckInNowPatch(now, toDate(event.checkInClosesAt));
    await updateDoc(doc(getFirebase().db, 'oh_events', event.id), patch);
  }
  async function rotateCodes() {
    if (
      !confirm(
        'This makes new QR codes for every station. The old printed cards will stop working. Print the new cards after this.',
      )
    ) {
      return;
    }
    setRotateNote('Making new codes…');
    try {
      await rotateStationMaterials(getFirebase().db, event);
      setRotateNote('New codes are ready. Print the station QR cards again.');
    } catch {
      setRotateNote('Could not make new codes. Please try again.');
    }
  }
  return (
    <div className="space-y-4">
      <label className="block text-sm font-semibold">
        Event
        <select className={`${fieldClass()} mt-1`} value={event.id} onChange={(e) => onPick(e.target.value)}>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} · {formatManilaDate(e.eventDate)}
            </option>
          ))}
        </select>
      </label>
      <p className="text-lg font-semibold">{open ? '✅ Check-in is OPEN' : '⛔ Check-in is closed'}</p>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Checked in" value={String(checkins.length)} />
        <Stat label="Can win now" value={String(canWinCount)} />
      </div>
      {isAdmin ? <CentralCheckinQr eventIsPublic={event.id === currentId} eventName={event.name} /> : null}
      <div className="rounded-2xl bg-white p-4 shadow">
        <h2 className="font-bold">Raffle booth scan requirement</h2>
        <p className="mt-1 text-sm">{event.boothScanRequirementSuspended === true ? 'SUSPENDED — checked-in guests qualify without station scans.' : 'ACTIVE — all station scans required.'}</p>
        {isAdmin ? <button type="button" disabled={overrideBusy || Boolean(pending)} onClick={() => void toggleBoothRequirement()} className="mt-3 rounded-xl bg-gray-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{overrideBusy ? 'Saving…' : event.boothScanRequirementSuspended === true ? 'Restore scan requirement' : 'Suspend scan requirement'}</button> : null}
        {pending ? <p className="text-sm text-amber-700">Finish the current winner before changing the requirement.</p> : null}
        {overrideError ? <p role="alert" className="text-sm text-red-700">{overrideError}</p> : null}
      </div>
      <div className="rounded-2xl bg-white p-4 shadow">
        <p className="text-xs uppercase tracking-widest text-gray-500">Stamps per station</p>
        <ul className="mt-2 divide-y">
          {event.booths.map((b, i) => (
            <li key={b.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                Station {i + 1} · <SafeText value={b.name} />
              </span>
              <span className="text-lg font-black">{boothStampCounts.get(b.id) ?? 0}</span>
            </li>
          ))}
        </ul>
      </div>
      {pending ? (
        <p className="rounded-xl bg-amber-50 p-3 text-sm">
          There is a winner waiting: <strong>{pending.displayName}</strong>. Mark Claimed or Not here before drawing again.
        </p>
      ) : null}
      <button
        type="button"
        onClick={onOpenDraw}
        className="w-full rounded-3xl bg-brand py-6 text-xl font-black uppercase tracking-widest text-white"
      >
        Start Draw
      </button>
      {isAdmin ? (
        <button
          type="button"
          onClick={onPrintCards}
          className="w-full rounded-2xl bg-gray-900 py-4 text-lg font-bold text-white"
        >
          Print station QR cards
        </button>
      ) : null}
      <div className="flex flex-wrap gap-2 text-sm">
        <button type="button" className="rounded-xl bg-white px-3 py-2 shadow" onClick={onGuestList}>
          Guest list
        </button>
        {isAdmin ? (
          <button type="button" className="rounded-xl bg-white px-3 py-2 shadow" onClick={onEdit}>
            {ADMIN_COPY.editEvent}
          </button>
        ) : null}
        <button type="button" className="rounded-xl bg-white px-3 py-2 shadow" onClick={() => downloadCsv(`checkins-${event.id}.csv`, checkinsCsv(event.id, checkins))}>
          Download check-ins
        </button>
        {isAdmin && event.id !== currentId ? (
          <button type="button" className="rounded-xl bg-white px-3 py-2 shadow" onClick={() => void setCurrent()}>
            Make this the public event
          </button>
        ) : null}
        {isAdmin ? (
          <>
            {!open ? (
              <button type="button" className="rounded-xl bg-white px-3 py-2 shadow" onClick={() => void openCheckInNow()}>
                {ADMIN_COPY.openCheckInNow}
              </button>
            ) : null}
            <button type="button" className="rounded-xl bg-white px-3 py-2 shadow" onClick={() => void setStatus('open')}>
              Open check-in
            </button>
            <button type="button" className="rounded-xl bg-white px-3 py-2 shadow" onClick={() => void setStatus('closed')}>
              Close check-in
            </button>
            <button type="button" className="rounded-xl bg-white px-3 py-2 shadow" onClick={() => void rotateCodes()}>
              Make new QR codes
            </button>
          </>
        ) : null}
      </div>
      {rotateNote ? <p className="text-sm text-gray-700">{rotateNote}</p> : null}
      <MoreDetails>
        <p>Window: {formatManilaTime(toDate(event.checkInOpensAt) ?? new Date())}–{formatManilaTime(toDate(event.checkInClosesAt) ?? new Date())} (Manila).</p>
        <p>Raffle: {raffleWindowOpen(event) ? 'open' : 'outside window'}. Repeat winners: {event.raffle.allowRepeatWinners ? 'ON' : 'OFF'}.</p>
        <p>Min stamps to win: {event.raffle.minStamps} of {event.booths.length}.</p>
        {syncNote ? <p>{syncNote}</p> : null}
        {flags.length > 0 ? (
          <div>
            <p className="font-semibold">Possible duplicates (same phone, different email)</p>
            <ul className="list-disc pl-5">
              {flags.map((f) => (
                <li key={f.personId + f.otherPersonId}>
                  {f.phone}: {f.email} vs {f.otherEmail || f.otherPersonId} — not merged automatically
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p>No phone duplicates to review.</p>
        )}
      </MoreDetails>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow">
      <p className="text-xs uppercase tracking-widest text-gray-500">{label}</p>
      <p className="text-3xl font-black">{value}</p>
    </div>
  );
}

function GuestListScreen({
  event,
  checkins,
  stamps,
  isAdmin,
  onSelect,
}: {
  event: OhEvent;
  checkins: Checkin[];
  stamps: StationStamp[];
  isAdmin: boolean;
  onSelect: (c: Checkin) => void;
}) {
  const [addingId, setAddingId] = useState<string | null>(null);
  if (checkins.length === 0) {
    return <GuestListEmpty hasEvent />;
  }
  return (
    <div className="space-y-3">
      <h2 className="font-bold">Guest list · {checkins.length}</h2>
      <button
        type="button"
        className="rounded-xl bg-white px-3 py-2 text-sm shadow"
        onClick={() => downloadCsv(`checkins-${event.id}.csv`, checkinsCsv(event.id, checkins))}
      >
        Download
      </button>
      <ul className="divide-y rounded-2xl bg-white shadow">
        {checkins.map((c) => {
          const doneBoothIds = boothIdsDoneForPerson(stamps, c.personId);
          const status = guestListStatus(doneBoothIds.length, event.booths.length);
          const showAdd = shouldShowAddStamps({
            isAdmin,
            uniqueStations: doneBoothIds.length,
            needed: event.booths.length,
          });
          return (
          <li key={c.personId}>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onSelect(c)}>
                <SafeText className="font-semibold" value={c.name} />
                <SafeText className="block text-xs text-gray-500" value={c.invitedBy ? `Invited by ${c.invitedBy}` : '—'} />
              </button>
              <div className="flex shrink-0 flex-col items-end gap-2">
                {isAdmin ? <span className="text-xs text-gray-400">{status}</span> : null}
                {showAdd ? (
                  <button
                    type="button"
                    className="rounded-xl bg-brand px-3 py-2 text-sm font-bold text-white"
                    onClick={() => setAddingId((id) => (id === c.personId ? null : c.personId))}
                  >
                    {ADMIN_COPY.addStamps}
                  </button>
                ) : null}
              </div>
            </div>
            {addingId === c.personId ? (
              <AddStampsPanel
                event={event}
                checkin={c}
                doneBoothIds={doneBoothIds}
                onClose={() => setAddingId(null)}
              />
            ) : null}
          </li>
          );
        })}
      </ul>
    </div>
  );
}

function GuestDetailScreen({
  event,
  checkin,
  stampCount,
  isAdmin,
  onBack,
}: {
  event: OhEvent;
  checkin: Checkin;
  stampCount: number;
  isAdmin: boolean;
  onBack: () => void;
}) {
  const [agent, setAgent] = useState(checkin.invitedBy);
  const [note, setNote] = useState('');
  async function saveAgent() {
    await updateDoc(doc(getFirebase().db, 'oh_events', event.id, 'checkins', checkin.personId), {
      invitedBy: agent.trim().slice(0, 80),
    });
    setNote('Saved.');
  }
  async function removeFromEvent() {
    if (!confirm('Remove this person from this event only? Their name stays in the people list.')) return;
    await deleteDoc(doc(getFirebase().db, 'oh_events', event.id, 'checkins', checkin.personId));
    onBack();
  }
  return (
    <div className="space-y-3 rounded-2xl bg-white p-4 shadow">
      <button type="button" className="text-sm underline" onClick={onBack}>
        Back to list
      </button>
      <SafeText as="h2" className="text-xl font-bold" value={checkin.name} />
      <p className="text-sm text-gray-600">{checkin.email}</p>
      <p className="text-sm text-gray-600">{checkin.phone}</p>
      <p className="text-sm">
        Stamps: {stampCount} of {event.booths.length}
      </p>
      {isAdmin ? (
        <>
          <label className="block text-sm">
            Invited by
            <input className={`${fieldClass()} mt-1`} value={agent} onChange={(e) => setAgent(e.target.value)} />
          </label>
          <button type="button" className="rounded-xl bg-gray-900 px-4 py-2 text-white" onClick={() => void saveAgent()}>
            Save agent name
          </button>
          <button type="button" className="ml-2 rounded-xl bg-red-50 px-4 py-2 text-red-700" onClick={() => void removeFromEvent()}>
            Remove from this event
          </button>
          {note ? <p className="text-sm text-green-700">{note}</p> : null}
        </>
      ) : null}
    </div>
  );
}

function HistoryScreen({ event, draws }: { event: OhEvent; draws: Draw[] }) {
  if (draws.length === 0) {
    return <HistoryEmpty hasEvent />;
  }
  return (
    <div className="space-y-3">
      <h2 className="font-bold">History</h2>
      <button
        type="button"
        className="rounded-xl bg-white px-3 py-2 text-sm shadow"
        onClick={() => downloadCsv(`winners-${event.id}.csv`, winnersCsv(event.id, draws))}
      >
        Download winners
      </button>
      <ol className="space-y-2">
        {draws.map((d) => (
          <li key={d.id} className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow">
            <span>
              #{d.id} <SafeText className="font-semibold" value={d.displayName} /> {d.prize ? `· ${d.prize}` : ''}
            </span>
            <span className="text-sm">{d.status === 'claimed' ? '✔' : d.status === 'no_show' ? '✖' : '•'} {statusLabel(d.status)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function NewEventScreen({
  last,
  existing,
  profile,
  onSaved,
}: {
  last: OhEvent | null;
  existing: OhEvent | null;
  profile: AdminProfile;
  onSaved: (id: string) => void;
}) {
  const prefill = existing ? detailsFromEvent(existing) : null;
  const [name, setName] = useState(prefill?.name ?? 'Open House');
  const [venue, setVenue] = useState(prefill?.venue || last?.venue || 'Cebu');
  const [date, setDate] = useState(prefill?.eventDate ?? todayYmdManila());
  const [openT, setOpenT] = useState(prefill?.openT ?? '08:00');
  const [closeT, setCloseT] = useState(prefill?.closeT ?? '18:00');
  const [raffleOpen, setRaffleOpen] = useState(prefill?.raffleOpen ?? '08:00');
  const [raffleClose, setRaffleClose] = useState(prefill?.raffleClose ?? '18:00');
  const [repeat, setRepeat] = useState(existing?.raffle.allowRepeatWinners === true);
  const [booths, setBooths] = useState<BoothDraft[]>(() => boothsFromLastEvent(last?.booths ?? []));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const editing = Boolean(existing);

  async function save() {
    setError('');
    if (!name.trim()) {
      setError('Please name the event.');
      return;
    }
    setBusy(true);
    try {
      const { db } = getFirebase();
      if (existing) {
        await updateDoc(doc(db, 'oh_events', existing.id), eventDetailsUpdate({
          name,
          venue,
          eventDate: date,
          openT,
          closeT,
          raffleOpen,
          raffleClose,
        }));
        onSaved(existing.id);
        return;
      }
      const id = `evt-${date}-${crypto.randomUUID().slice(0, 8)}`;
      const materials = await buildStationMaterials(id, booths.filter((b) => b.name.trim()));
      const opens = Timestamp.fromDate(manilaDateTimeToDate(date, openT));
      const closes = Timestamp.fromDate(manilaDateTimeToDate(date, closeT));
      const rOpens = Timestamp.fromDate(manilaDateTimeToDate(date, raffleOpen));
      const rCloses = Timestamp.fromDate(manilaDateTimeToDate(date, raffleClose));
      await setDoc(doc(db, 'oh_events', id), {
        name: name.trim(),
        venue: venue.trim(),
        eventDate: date,
        checkInOpensAt: opens,
        checkInClosesAt: closes,
        raffle: {
          opensAt: rOpens,
          closesAt: rCloses,
          minStamps: materials.booths.length,
          allowRepeatWinners: repeat,
          prizes: [],
        },
        booths: materials.booths,
        status: 'draft',
        createdBy: profile.email,
        pendingDrawNo: null,
        lastDrawNo: 0,
        createdAt: serverTimestamp(),
      });
      await writeStationMaterials(db, id, materials);
      onSaved(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl bg-white p-4 shadow">
      <h2 className="font-bold">{editing ? ADMIN_COPY.editEvent : 'New event'}</h2>
      <label className="block text-sm">
        Name
        <input className={`${fieldClass()} mt-1`} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="block text-sm">
        Date
        <input type="date" className={`${fieldClass()} mt-1`} value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="block text-sm">
        Venue
        <input className={`${fieldClass()} mt-1`} value={venue} onChange={(e) => setVenue(e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm">
          Check-in opens
          <input type="time" className={`${fieldClass()} mt-1`} value={openT} onChange={(e) => setOpenT(e.target.value)} />
        </label>
        <label className="text-sm">
          Check-in closes
          <input type="time" className={`${fieldClass()} mt-1`} value={closeT} onChange={(e) => setCloseT(e.target.value)} />
        </label>
      </div>
      <MoreDetails title="More details">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">
            Raffle opens
            <input type="time" className={`${fieldClass()} mt-1`} value={raffleOpen} onChange={(e) => setRaffleOpen(e.target.value)} />
          </label>
          <label className="text-sm">
            Raffle closes
            <input type="time" className={`${fieldClass()} mt-1`} value={raffleClose} onChange={(e) => setRaffleClose(e.target.value)} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
          Allow the same person to win more than once at this event (usually leave this OFF)
        </label>
        {editing ? (
          <p>Station names, QR codes, and station ids stay as they were. Printed cards still work.</p>
        ) : (
          <>
            <p className="font-semibold">Stations (new QR codes each event — print the cards from Today)</p>
            {booths.map((b, i) => (
              <div key={b.id} className="grid grid-cols-2 gap-2">
                <label className="text-sm">
                  Station {i + 1} name
                  <input
                    className={`${fieldClass()} mt-1`}
                    value={b.name}
                    onChange={(e) => setBooths((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  />
                </label>
                <label className="text-sm">
                  Backup code if a camera will not scan
                  <input
                    className={`${fieldClass()} mt-1`}
                    value={b.code}
                    onChange={(e) => setBooths((prev) => prev.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))}
                    autoCapitalize="characters"
                    autoComplete="off"
                  />
                </label>
              </div>
            ))}
          </>
        )}
      </MoreDetails>
      <p className="text-sm text-gray-600">
        {editing
          ? 'This keeps the same event and the same printed station cards. It does not make new QR codes.'
          : 'Saving does not switch the public guest event. On Today, use “Make this the public event”, then “Print station QR cards”.'}
      </p>
      <FieldError message={error} />
      <button type="button" disabled={busy} className="w-full rounded-2xl bg-brand py-3 font-bold text-white" onClick={() => void save()}>
        {busy ? 'Saving…' : editing ? ADMIN_COPY.save : 'Save event'}
      </button>
    </div>
  );
}

function PeopleTools({
  flags,
  people,
  setPeople,
}: {
  flags: DuplicateFlag[];
  people: Person[];
  setPeople: (p: Person[]) => void;
}) {
  async function loadPeople() {
    const snap = await getDocs(collection(getFirebase().db, 'oh_people'));
    setPeople(snap.docs.map((d) => parsePerson(d.id, d.data() as Record<string, unknown>)));
  }
  return (
    <div className="space-y-2">
      <p>All-people export is admin-only. Duplicates are flagged, never auto-merged.</p>
      {flags.length ? <p>{flags.length} possible duplicate(s) to review on Today → More details.</p> : null}
      <button
        type="button"
        className="rounded-xl bg-gray-900 px-3 py-2 text-white"
        onClick={async () => {
          if (people.length === 0) await loadPeople();
          const list = people.length ? people : (await getDocs(collection(getFirebase().db, 'oh_people'))).docs.map((d) => parsePerson(d.id, d.data() as Record<string, unknown>));
          setPeople(list);
          downloadCsv('oh-people.csv', peopleCsv(list));
        }}
      >
        Download all people
      </button>
    </div>
  );
}

function DrawRoute({ profile }: { profile: AdminProfile }) {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const [eventId, setEventId] = useState<string>(params.get('event') ?? '');
  const [poolCount, setPoolCount] = useState(0);
  const [spin, setSpin] = useState<string | null>(null);
  const [pending, setPending] = useState<Draw | null>(null);
  const [eventName, setEventName] = useState('Open House');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [fullContact, setFullContact] = useState<Checkin | null>(null);
  const [reel, setReel] = useState<{ names: string[]; winner: string } | null>(null);

  useEffect(() => {
    if (eventId) return;
    const { db } = getFirebase();
    return onSnapshot(doc(db, 'oh_config', 'public'), (snap) => {
      if (snap.exists()) setEventId(String((snap.data() as { currentEventId?: string }).currentEventId ?? ''));
    });
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    let stop = false;
    async function refresh() {
      const live = await loadLivePool(getFirebase().db, eventId);
      if (stop) return;
      setEventName(live.event.name);
      setPoolCount(live.pool.length);
      if (live.event.pendingDrawNo != null) {
        const drawSnap = await getDoc(doc(getFirebase().db, 'oh_events', eventId, 'draws', String(live.event.pendingDrawNo)));
        if (drawSnap.exists()) {
          const d = parseDraw(drawSnap.id, drawSnap.data() as Record<string, unknown>);
          setPending(d);
          const cin = live.checkins.find((c) => c.personId === d.personId) ?? null;
          setFullContact(cin ?? null);
        }
      } else {
        setPending(null);
        setFullContact(null);
      }
    }
    void refresh();
    const unsub = onSnapshot(doc(getFirebase().db, 'oh_events', eventId), () => void refresh());
    return () => {
      stop = true;
      unsub();
    };
  }, [eventId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === 'Space') {
        e.preventDefault();
        if (!pending && !busy && !reel) void doDraw();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function doDraw() {
    if (!eventId || pending || reel || profile.role !== 'admin') return;
    setBusy(true);
    setError('');
    try {
      const live = await loadLivePool(getFirebase().db, eventId);
      if (live.pool.length === 0) {
        setError('Nobody is eligible right now.');
        return;
      }
      const names = live.pool.map((c) => projectorName(c.name));
      const result = await drawAndLock(getFirebase().db, eventId, profile.email);
      if (!result.ok) {
        setError(result.reason === 'pending' ? 'Finish the current winner first.' : 'Nobody is eligible right now.');
        setSpin(null);
        return;
      }
      setSpin(null);
      setReel({ names, winner: result.displayName });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Draw failed');
      setSpin(null);
    } finally {
      setBusy(false);
    }
  }

  async function resolve(status: 'claimed' | 'no_show') {
    if (!eventId) return;
    setBusy(true);
    try {
      await resolvePendingDraw(getFirebase().db, eventId, status);
      setPending(null);
      setReel(null);
      if (status === 'no_show') {
        await doDraw();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-4 py-8 text-center">
        <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Open House Raffle</p>
        <h1 className="mt-2 text-2xl font-bold">{eventName}</h1>
        <p className="mt-2 text-slate-300">{poolCount} in the draw</p>
        <div className="my-10 w-full rounded-3xl border border-red-500/40 bg-slate-900 p-8">
          {reel ? (
            <ProjectorReel
              names={reel.names}
              winner={reel.winner}
              onDone={() => setReel(null)}
            />
          ) : pending ? (
            <div className="projector-reel-winner-on">
              <ProjectorName displayName={pending.displayName} invitedBy={pending.invitedBy} large />
            </div>
          ) : (
            <>
              <ProjectorName displayName={spin ?? 'READY?'} large />
              {spin ? null : <p className="mt-4 text-sm sm:text-base text-slate-300">{DRAW_HINT}</p>}
            </>
          )}
        </div>
        {reel ? (
          <p className="text-slate-400">Drawing…</p>
        ) : pending ? (
          <div className="flex w-full flex-col gap-3 sm:flex-row">
            <button type="button" disabled={busy || profile.role !== 'admin'} className="flex-1 rounded-2xl bg-green-600 py-4 text-lg font-black" onClick={() => void resolve('claimed')}>
              ✔ Claimed
            </button>
            <button type="button" disabled={busy || profile.role !== 'admin'} className="flex-1 rounded-2xl bg-red-600 py-4 text-lg font-black" onClick={() => void resolve('no_show')}>
              ✖ Not here → draw again
            </button>
          </div>
        ) : (
          <button type="button" disabled={busy || profile.role !== 'admin'} className="w-full rounded-2xl bg-brand py-5 text-2xl font-black" onClick={() => void doDraw()}>
            DRAW
          </button>
        )}
        {error ? <p className="mt-3 text-red-300">{error}</p> : null}
        {pending && fullContact ? (
          <MoreDetails title="More details">
            <p>Full contact (host laptop only, never on the projector names above):</p>
            <p>{fullContact.name}</p>
            <p>{fullContact.email}</p>
            <p>{fullContact.phone}</p>
          </MoreDetails>
        ) : null}
        <button type="button" className="mt-8 text-sm text-slate-400 underline" onClick={() => navigate('/admin')}>
          Back to Today
        </button>
      </div>
    </div>
  );
}
