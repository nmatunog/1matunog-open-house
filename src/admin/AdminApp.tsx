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
import { boothsFromLastEvent, boothsToStored, type BoothDraft } from '../lib/booths';
import { checkinsCsv, downloadCsv, peopleCsv, winnersCsv } from '../lib/csv';
import { eligiblePool, eventCheckInOpen, raffleWindowOpen, statusLabel } from '../lib/eligibility';
import { parsePerson, syncEventCheckins } from '../lib/peopleSync';
import { drawAndLock, loadLivePool, parseCheckin, parseDraw, resolvePendingDraw, spinNames } from '../lib/raffle';
import { formatManilaDate, formatManilaTime, manilaDateTimeToDate, todayYmdManila, toDate } from '../lib/time';
import type { AdminProfile, Checkin, Draw, DuplicateFlag, OhEvent, OhRole, Person } from '../types';

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
      const snap = await getDoc(doc(db, 'oh_admins', email));
      if (!snap.exists() || snap.data()?.active !== true) {
        setProfile('missing');
      } else {
        const role = (snap.data()?.role as OhRole) === 'admin' ? 'admin' : 'viewer';
        setProfile({ uid: next.uid, email, role, active: true });
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
  const [draws, setDraws] = useState<Draw[]>([]);
  const [flags, setFlags] = useState<DuplicateFlag[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<Checkin | null>(null);
  const [syncNote, setSyncNote] = useState('');

  useEffect(() => {
    const { db } = getFirebase();
    const unsubEvents = onSnapshot(collection(db, 'oh_events'), (snap) => {
      const list = snap.docs.map((d) => {
        const data = d.data() as Omit<OhEvent, 'id'>;
        return { ...data, id: d.id, pendingDrawNo: data.pendingDrawNo ?? null, lastDrawNo: data.lastDrawNo ?? 0 } as OhEvent;
      });
      list.sort((a, b) => b.eventDate.localeCompare(a.eventDate));
      setEvents(list);
    });
    const unsubCfg = onSnapshot(doc(db, 'oh_config', 'public'), (snap) => {
      if (snap.exists()) {
        const id = String((snap.data() as { currentEventId?: string }).currentEventId ?? '');
        setCurrentId(id);
        setEventId((prev) => prev || id);
      }
    });
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
    const unsubC = onSnapshot(collection(db, 'oh_events', selectedEventId, 'checkins'), (snap) => {
      setCheckins(snap.docs.map((d) => parseCheckin(d.id, d.data() as Record<string, unknown>)));
    });
    const unsubD = onSnapshot(collection(db, 'oh_events', selectedEventId, 'draws'), (snap) => {
      const list = snap.docs.map((d) => parseDraw(d.id, d.data() as Record<string, unknown>));
      list.sort((a, b) => Number(a.id) - Number(b.id));
      setDraws(list);
    });
    return () => {
      unsubC();
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

  const canWin = event ? eligiblePool(checkins, event, winners) : [];
  const pending = event && event.pendingDrawNo != null ? draws.find((d) => d.id === String(event.pendingDrawNo)) : null;

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
            <NavBtn onClick={() => setScreen('new')} active={screen === 'new'}>
              New event
            </NavBtn>
          ) : null}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl p-4 pb-16">
        {screen === 'today' && event ? (
          <TodayScreen
            events={events}
            event={event}
            currentId={currentId}
            isAdmin={isAdmin}
            checkins={checkins}
            canWinCount={canWin.length}
            pending={pending ?? null}
            onPick={setEventId}
            onOpenDraw={() => navigate(`/admin/draw?event=${event.id}`)}
            onGuestList={() => setScreen('list')}
            flags={flags}
            syncNote={syncNote}
          />
        ) : null}
        {screen === 'list' && event ? (
          <GuestListScreen
            event={event}
            checkins={checkins}
            isAdmin={isAdmin}
            onSelect={(c) => {
              setSelectedPerson(c);
              setScreen('guest');
            }}
          />
        ) : null}
        {screen === 'guest' && event && selectedPerson ? (
          <GuestDetailScreen
            event={event}
            checkin={selectedPerson}
            isAdmin={isAdmin}
            onBack={() => setScreen('list')}
          />
        ) : null}
        {screen === 'history' && event ? <HistoryScreen event={event} draws={draws} /> : null}
        {screen === 'new' && isAdmin ? (
          <NewEventScreen
            last={events[0] ?? null}
            profile={profile}
            onSaved={(id) => {
              setEventId(id);
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
  canWinCount,
  pending,
  onPick,
  onOpenDraw,
  onGuestList,
  flags,
  syncNote,
}: {
  events: OhEvent[];
  event: OhEvent;
  currentId: string;
  isAdmin: boolean;
  checkins: Checkin[];
  canWinCount: number;
  pending: Draw | null;
  onPick: (id: string) => void;
  onOpenDraw: () => void;
  onGuestList: () => void;
  flags: DuplicateFlag[];
  syncNote: string;
}) {
  const open = eventCheckInOpen(event);
  async function setCurrent() {
    await setDoc(doc(getFirebase().db, 'oh_config', 'public'), { currentEventId: event.id }, { merge: true });
  }
  async function setStatus(status: OhEvent['status']) {
    await updateDoc(doc(getFirebase().db, 'oh_events', event.id), { status });
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
      <div className="flex flex-wrap gap-2 text-sm">
        <button type="button" className="rounded-xl bg-white px-3 py-2 shadow" onClick={onGuestList}>
          Guest list
        </button>
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
            <button type="button" className="rounded-xl bg-white px-3 py-2 shadow" onClick={() => void setStatus('open')}>
              Open check-in
            </button>
            <button type="button" className="rounded-xl bg-white px-3 py-2 shadow" onClick={() => void setStatus('closed')}>
              Close check-in
            </button>
          </>
        ) : null}
      </div>
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
  isAdmin,
  onSelect,
}: {
  event: OhEvent;
  checkins: Checkin[];
  isAdmin: boolean;
  onSelect: (c: Checkin) => void;
}) {
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
        {checkins.map((c) => (
          <li key={c.personId}>
            <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-left" onClick={() => onSelect(c)}>
              <span>
                <SafeText className="font-semibold" value={c.name} />
                <SafeText className="block text-xs text-gray-500" value={c.invitedBy ? `Invited by ${c.invitedBy}` : '—'} />
              </span>
              {isAdmin ? <span className="text-xs text-gray-400">Open</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GuestDetailScreen({
  event,
  checkin,
  isAdmin,
  onBack,
}: {
  event: OhEvent;
  checkin: Checkin;
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
      <p className="text-sm">Stamps: {checkin.stampsCompleted}</p>
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
  profile,
  onSaved,
}: {
  last: OhEvent | null;
  profile: AdminProfile;
  onSaved: (id: string) => void;
}) {
  const [name, setName] = useState('Open House');
  const [venue, setVenue] = useState(last?.venue || 'Cebu');
  const [date, setDate] = useState(todayYmdManila());
  const [openT, setOpenT] = useState('08:00');
  const [closeT, setCloseT] = useState('18:00');
  const [raffleOpen, setRaffleOpen] = useState('08:00');
  const [raffleClose, setRaffleClose] = useState('18:00');
  const [repeat, setRepeat] = useState(false);
  const [booths, setBooths] = useState<BoothDraft[]>(() => boothsFromLastEvent(last?.booths ?? []));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setError('');
    if (!name.trim()) {
      setError('Please name the event.');
      return;
    }
    setBusy(true);
    try {
      const stored = await boothsToStored(booths.filter((b) => b.name.trim()));
      const id = `evt-${date}-${crypto.randomUUID().slice(0, 8)}`;
      const opens = Timestamp.fromDate(manilaDateTimeToDate(date, openT));
      const closes = Timestamp.fromDate(manilaDateTimeToDate(date, closeT));
      const rOpens = Timestamp.fromDate(manilaDateTimeToDate(date, raffleOpen));
      const rCloses = Timestamp.fromDate(manilaDateTimeToDate(date, raffleClose));
      await setDoc(doc(getFirebase().db, 'oh_events', id), {
        name: name.trim(),
        venue: venue.trim(),
        eventDate: date,
        checkInOpensAt: opens,
        checkInClosesAt: closes,
        raffle: {
          opensAt: rOpens,
          closesAt: rCloses,
          minStamps: stored.length,
          allowRepeatWinners: repeat,
          prizes: [],
        },
        booths: stored,
        status: 'draft',
        createdBy: profile.email,
        pendingDrawNo: null,
        lastDrawNo: 0,
        createdAt: serverTimestamp(),
      });
      onSaved(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl bg-white p-4 shadow">
      <h2 className="font-bold">New event</h2>
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
        <p className="font-semibold">Booths (new codes each event — write them down for presenters)</p>
        {booths.map((b, i) => (
          <div key={b.id} className="grid grid-cols-2 gap-2">
            <input
              className={fieldClass()}
              value={b.name}
              onChange={(e) => setBooths((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
            />
            <input
              className={fieldClass()}
              value={b.code}
              onChange={(e) => setBooths((prev) => prev.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))}
            />
          </div>
        ))}
      </MoreDetails>
      <p className="text-sm text-gray-600">
        Saving does not switch the public guest event. On Today, use “Make this the public event” when you are ready.
      </p>
      <FieldError message={error} />
      <button type="button" disabled={busy} className="w-full rounded-2xl bg-brand py-3 font-bold text-white" onClick={() => void save()}>
        {busy ? 'Saving…' : 'Save event'}
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
        if (!pending && !busy) void doDraw();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function doDraw() {
    if (!eventId || pending || profile.role !== 'admin') return;
    setBusy(true);
    setError('');
    try {
      const live = await loadLivePool(getFirebase().db, eventId);
      const frames = spinNames(live.pool, 14);
      for (const n of frames) {
        setSpin(n);
        await new Promise((r) => setTimeout(r, 70));
      }
      const result = await drawAndLock(getFirebase().db, eventId, profile.email);
      if (!result.ok) {
        setError(result.reason === 'pending' ? 'Finish the current winner first.' : 'Nobody is eligible right now.');
        setSpin(null);
        return;
      }
      setSpin(null);
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
          {pending ? (
            <ProjectorName displayName={pending.displayName} invitedBy={pending.invitedBy} large />
          ) : (
            <ProjectorName displayName={spin ?? 'READY?'} invitedBy={spin ? undefined : 'Press DRAW or the space bar'} large />
          )}
        </div>
        {pending ? (
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
