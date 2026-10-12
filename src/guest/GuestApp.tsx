import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { signInAnonymously } from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { MoreDetails } from '../components/MoreDetails';
import { FieldError, fieldClass } from '../components/FieldError';
import { SafeText } from '../components/SafeText';
import { getFirebase } from '../firebase/app';
import { firebaseConfigReady, readFirebaseWebConfig } from '../firebase/config';
import { encodeConsentVersion } from '../lib/consent';
import { eventCheckInOpen } from '../lib/eligibility';
import { isValidEmail, isValidInvitedBy, isValidName, normalizeEmail, personIdFromEmail } from '../lib/person';
import { formatPhoneInput, normalizePhPhone } from '../lib/phone';
import {
  clearDeviceCheckin,
  clearGuestProfile,
  clearPassportSession,
  clearPendingStationScan,
  loadDeviceCheckin,
  loadGuestProfile,
  loadPassportSession,
  loadPendingStationScan,
  saveDeviceCheckin,
  saveGuestProfile,
  savePassportSession,
  savePendingStationScan,
} from '../lib/storage';
import { projectorName } from '../lib/displayName';
import { formatManilaDate } from '../lib/time';
import { stampDocId } from '../lib/stations';
import type { GuestDetails, OhEvent, PassportSession } from '../types';
import { PrivacyNotice } from './PrivacyNotice';
import { applyStationStamp, stampConfirmCopy } from './applyStamp';

type Step = 'welcome' | 'details' | 'passport' | 'done' | 'unavailable';

type StampFlash = {
  kind: 'stamped' | 'already';
  stationNo: number;
  doneCount: number;
  needed: number;
  name: string;
};

const emptyDetails: GuestDetails = {
  name: '',
  email: '',
  phone: '',
  invitedBy: '',
  privacyAgreed: false,
  marketingOptIn: false,
};

export function GuestApp() {
  const params = useParams<{ eventId?: string; token?: string }>();
  const scanEventId = params.eventId;
  const scanToken = params.token;
  const configOk = firebaseConfigReady(readFirebaseWebConfig());
  const [step, setStep] = useState<Step>('welcome');
  const [event, setEvent] = useState<OhEvent | null>(null);
  const [eventError, setEventError] = useState('');
  const [details, setDetails] = useState<GuestDetails>(emptyDetails);
  const [stamped, setStamped] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [personId, setPersonId] = useState<string | undefined>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [typedCode, setTypedCode] = useState('');
  const [showTyped, setShowTyped] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [returning, setReturning] = useState(false);
  const [alreadyCheckedIn, setAlreadyCheckedIn] = useState(false);
  const [flash, setFlash] = useState<StampFlash | null>(null);
  const [scanNote, setScanNote] = useState('');
  const stampedRef = useRef<string[]>([]);
  const applyKeyRef = useRef<string>('');
  const runStampRef = useRef<(token: string) => Promise<void>>(async () => {});

  useEffect(() => {
    if (!configOk) return;
    const { db, auth } = getFirebase();
    void signInAnonymously(auth).catch(() => {
      setEventError('Could not start a guest session. Please refresh.');
    });

    let unsubCfg: (() => void) | undefined;
    let cancelled = false;

    async function loadEventById(id: string) {
      const ev = await getDoc(doc(db, 'oh_events', id));
      if (cancelled) return;
      if (!ev.exists()) {
        setEvent(null);
        setEventError('This station card is not valid. Please see a host.');
        return;
      }
      const data = ev.data() as Omit<OhEvent, 'id'>;
      const loaded: OhEvent = {
        id: ev.id,
        ...data,
        pendingDrawNo: data.pendingDrawNo ?? null,
        lastDrawNo: data.lastDrawNo ?? 0,
      };
      setEvent(loaded);
      setEventError('');
      const saved = loadPassportSession(loaded.id);
      const profile = loadGuestProfile();
      const device = loadDeviceCheckin(loaded.id);
      if (saved) {
        setDetails(saved.details);
        setStamped(saved.stampedBoothIds);
        setSubmitted(saved.submitted);
        setPersonId(saved.personId);
        if (saved.submitted || device?.personId) {
          setAlreadyCheckedIn(Boolean(device?.personId && saved.submitted));
          setPersonId(saved.personId || device?.personId);
          setStep(saved.stampedBoothIds.length >= loaded.booths.length ? 'done' : 'passport');
        } else if (saved.details.privacyAgreed) setStep('passport');
      } else if (device?.personId) {
        setPersonId(device.personId);
        setSubmitted(true);
        if (profile) setDetails(profile);
        setStep('passport');
      } else if (profile) {
        setDetails(profile);
        setReturning(true);
      }
      if (scanToken) {
        savePendingStationScan({ eventId: loaded.id, token: scanToken });
        if (!device?.personId && !saved?.personId && !saved?.submitted) {
          setScanNote('First a quick check-in, then we will stamp this station.');
          setStep('details');
        }
      }
    }

    if (scanEventId) {
      void loadEventById(scanEventId);
    } else {
      unsubCfg = onSnapshot(
        doc(db, 'oh_config', 'public'),
        async (snap) => {
          if (!snap.exists()) {
            setEvent(null);
            setEventError('No event is published yet.');
            return;
          }
          const currentEventId = String((snap.data() as { currentEventId?: string }).currentEventId ?? '');
          if (!currentEventId) {
            setEvent(null);
            setEventError('No event is published yet.');
            return;
          }
          await loadEventById(currentEventId);
        },
        () => setEventError('Could not load the event. Please refresh.'),
      );
    }

    return () => {
      cancelled = true;
      unsubCfg?.();
    };
  }, [configOk, scanEventId, scanToken]);

  useEffect(() => {
    if (!event) return;
    const session: PassportSession = {
      eventId: event.id,
      details,
      stampedBoothIds: stamped,
      submitted,
      personId,
    };
    savePassportSession(session);
    stampedRef.current = stamped;
  }, [event, details, stamped, submitted, personId]);

  useEffect(() => {
    if (!event || !personId) return;
    const { auth, db } = getFirebase();
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    let cancelled = false;
    void (async () => {
      const found: string[] = [];
      for (const booth of event.booths) {
        const snap = await getDoc(doc(db, 'oh_events', event.id, 'stamps', stampDocId(uid, booth.id)));
        if (cancelled) return;
        if (snap.exists()) found.push(booth.id);
      }
      if (found.length) {
        setStamped((prev) => [...new Set([...prev, ...found])]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [event, personId]);

  useEffect(() => {
    if (!event || !scanToken) return;
    const pending = loadPendingStationScan();
    const token = pending?.eventId === event.id ? pending.token : scanToken;
    if (!token) return;
    if (!personId) return;
    const applyKey = `${event.id}:${token}:${personId}`;
    if (applyKeyRef.current === applyKey) return;
    applyKeyRef.current = applyKey;
    void runStampRef.current(token);
  }, [event, scanToken, personId]);

  const open = event ? eventCheckInOpen(event) : false;
  const needed = event?.booths.length ?? 0;
  const doneCount = stamped.length;

  function stationNo(boothId: string): number {
    if (!event) return 0;
    return event.booths.findIndex((b) => b.id === boothId) + 1;
  }

  function stationName(boothId: string): string {
    return event?.booths.find((b) => b.id === boothId)?.name ?? 'Station';
  }

  function showFlash(kind: StampFlash['kind'], boothId: string, nextStamped: string[]) {
    const count = nextStamped.length;
    setFlash({
      kind,
      stationNo: stationNo(boothId),
      doneCount: count,
      needed,
      name: stationName(boothId),
    });
    if (count >= needed && needed > 0) setStep('done');
  }

  function validateDetails(): boolean {
    const next: Record<string, string> = {};
    if (!isValidName(details.name)) next.name = 'Please enter your full name (at least 2 letters).';
    const phone = normalizePhPhone(details.phone);
    if (!phone) next.phone = 'Enter a Philippine mobile number, like 09XX XXX XXXX.';
    if (!isValidEmail(details.email)) next.email = 'Enter a valid email address.';
    if (!isValidInvitedBy(details.invitedBy)) next.invitedBy = 'That name is too long.';
    if (!details.privacyAgreed) next.privacy = 'Please agree to the Privacy Notice to continue.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function writeCheckin(cleaned: GuestDetails): Promise<string> {
    const { db, auth } = getFirebase();
    if (!auth.currentUser?.uid) await signInAnonymously(auth);
    const anonUid = getFirebase().auth.currentUser?.uid;
    if (!anonUid || !event) throw new Error('Not signed in');
    const pid = await personIdFromEmail(cleaned.email);
    try {
      await setDoc(doc(db, 'oh_events', event.id, 'checkins', pid), {
        name: cleaned.name.trim(),
        email: normalizeEmail(cleaned.email),
        phone: cleaned.phone,
        invitedBy: cleaned.invitedBy.trim(),
        stampsCompleted: 0,
        checkedInAt: serverTimestamp(),
        anonUid,
        consentVersion: encodeConsentVersion(cleaned.marketingOptIn),
      });
      setAlreadyCheckedIn(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.toLowerCase().includes('permission') || message.toLowerCase().includes('already')) {
        setAlreadyCheckedIn(true);
      } else {
        throw err;
      }
    }
    saveDeviceCheckin({ eventId: event.id, personId: pid, name: cleaned.name.trim() });
    setPersonId(pid);
    setSubmitted(true);
    return pid;
  }

  async function onDetailsNext() {
    if (!validateDetails() || !event) return;
    const phone = normalizePhPhone(details.phone);
    if (!phone) return;
    const cleaned: GuestDetails = {
      ...details,
      name: details.name.trim(),
      email: normalizeEmail(details.email),
      phone,
      invitedBy: details.invitedBy.trim(),
    };
    setDetails(cleaned);
    saveGuestProfile(cleaned);
    if (!open) {
      setErrors({ submit: 'Check-in is not open right now.' });
      return;
    }
    setBusy(true);
    try {
      await writeCheckin(cleaned);
      setStep('passport');
    } catch {
      setErrors({ submit: 'Could not check you in. Please find a host.' });
    } finally {
      setBusy(false);
    }
  }

  async function runStamp(token: string) {
    if (!event) return;
    const { auth, db } = getFirebase();
    if (!auth.currentUser?.uid) {
      try {
        await signInAnonymously(auth);
      } catch {
        setCodeError('Could not start a guest session. Please refresh.');
        return;
      }
    }
    const anonUid = getFirebase().auth.currentUser?.uid;
    const pid = personId ?? loadDeviceCheckin(event.id)?.personId;
    if (!anonUid || !pid) {
      savePendingStationScan({ eventId: event.id, token });
      setScanNote('First a quick check-in, then we will stamp this station.');
      setStep('details');
      return;
    }
    setBusy(true);
    setCodeError('');
    try {
      const result = await applyStationStamp({
        db,
        eventId: event.id,
        token,
        anonUid,
        personId: pid,
      });
      if (!result.ok) {
        setCodeError(result.message);
        setScanNote(result.message);
        return;
      }
      const prev = stampedRef.current;
      const next = prev.includes(result.boothId) ? prev : [...prev, result.boothId];
      setStamped(next);
      clearPendingStationScan();
      setShowTyped(false);
      setTypedCode('');
      setStep('passport');
      showFlash(result.status, result.boothId, next);
    } finally {
      setBusy(false);
    }
  }
  runStampRef.current = runStamp;

  async function onTypedStamp() {
    if (!typedCode.trim()) {
      setCodeError('Type the 6-letter station code from the card.');
      return;
    }
    await runStamp(typedCode);
  }

  const headerDate = event ? `${formatManilaDate(event.eventDate)} · ${event.venue || 'Cebu'}` : '';

  if (!configOk) {
    return (
      <Shell>
        <Header subtitle="Setup needed" />
        <div className="p-6 text-sm text-gray-700">
          This copy of the app is missing its Firebase settings. Ask a host to finish setup from
          <code className="mx-1">.env.example</code>.
        </div>
      </Shell>
    );
  }

  if (eventError && !event) {
    return (
      <Shell>
        <Header subtitle="Open House" />
        <div className="p-6 space-y-4">
          <p className="text-gray-700">{eventError}</p>
          <p className="text-sm text-gray-500">Check-in is not open yet. Please see a host.</p>
          <AdminLink />
        </div>
      </Shell>
    );
  }

  if (step === 'done' && event) {
    return (
      <Shell>
        <Header subtitle={headerDate} />
        <div className="p-6 space-y-4 text-center">
          <div className="rounded-3xl bg-green-600 text-white p-6">
            <p className="text-sm uppercase tracking-widest opacity-80">You&apos;re checked in!</p>
            <SafeText as="h2" className="mt-2 text-3xl font-black" value={projectorName(details.name || 'Guest')} />
            <p className="mt-2 text-sm">
              {formatManilaDate(event.eventDate)} · {doneCount}/{needed} stations
            </p>
          </div>
          <p className="text-gray-700 font-medium">Show this screen at the rewards counter.</p>
          {alreadyCheckedIn ? (
            <p className="text-green-700 font-semibold">You&apos;re already checked in. ✓</p>
          ) : null}
          <button
            type="button"
            className="w-full rounded-2xl bg-gray-900 py-3 font-bold text-white"
            onClick={() => setStep('passport')}
          >
            Back to my passport
          </button>
        </div>
        {flash ? <StampFlashCard flash={flash} onClose={() => setFlash(null)} /> : null}
      </Shell>
    );
  }

  if (step === 'details') {
    return (
      <Shell>
        <Header subtitle="Your details" />
        <form
          className="p-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void onDetailsNext();
          }}
        >
          {scanNote ? <p className="rounded-2xl bg-rose-50 p-3 text-sm font-medium text-brand">{scanNote}</p> : null}
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Name</span>
            <input
              className={fieldClass(errors.name)}
              value={details.name}
              onChange={(e) => setDetails((d) => ({ ...d, name: e.target.value }))}
              autoComplete="name"
              maxLength={80}
            />
            <FieldError message={errors.name} />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Mobile</span>
            <input
              className={fieldClass(errors.phone)}
              value={formatPhoneInput(details.phone.startsWith('+63') ? '0' + details.phone.slice(3) : details.phone)}
              onChange={(e) => setDetails((d) => ({ ...d, phone: formatPhoneInput(e.target.value) }))}
              inputMode="numeric"
              autoComplete="tel"
              placeholder="09XX XXX XXXX"
            />
            <FieldError message={errors.phone} />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Email</span>
            <input
              className={fieldClass(errors.email)}
              value={details.email}
              onChange={(e) => setDetails((d) => ({ ...d, email: e.target.value }))}
              type="email"
              autoComplete="email"
              maxLength={120}
            />
            <FieldError message={errors.email} />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Invited by</span>
            <input
              className={fieldClass(errors.invitedBy)}
              value={details.invitedBy}
              onChange={(e) => setDetails((d) => ({ ...d, invitedBy: e.target.value }))}
              placeholder="Agent name"
              maxLength={80}
            />
            <FieldError message={errors.invitedBy} />
          </label>
          <PrivacyNotice />
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={details.privacyAgreed}
              onChange={(e) => setDetails((d) => ({ ...d, privacyAgreed: e.target.checked }))}
            />
            <span>I agree to the Privacy Notice (required)</span>
          </label>
          <FieldError message={errors.privacy} />
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={details.marketingOptIn}
              onChange={(e) => setDetails((d) => ({ ...d, marketingOptIn: e.target.checked }))}
            />
            <span>OK to contact me about AIA offers (optional)</span>
          </label>
          <FieldError message={errors.submit} />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-2xl bg-brand py-4 font-bold uppercase tracking-widest text-white disabled:bg-gray-200"
          >
            {busy ? 'Checking you in…' : 'Next'}
          </button>
        </form>
      </Shell>
    );
  }

  if (step === 'passport' && event) {
    return (
      <Shell>
        <Header subtitle={headerDate} />
        <div className="p-6 space-y-4">
          <p className="text-lg font-semibold">
            Hi, <SafeText value={details.name.split(' ')[0] || 'friend'} />! {doneCount} of {needed} stations
          </p>
          <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-brand transition-all"
              style={{ width: `${needed ? (doneCount / needed) * 100 : 0}%` }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {event.booths.map((b, i) => {
              const done = stamped.includes(b.id);
              return (
                <div
                  key={b.id}
                  className={`rounded-2xl border-2 p-4 text-left font-semibold ${
                    done ? 'border-green-500 bg-green-50 text-green-800' : 'border-dashed border-pink-300 bg-rose-50'
                  }`}
                >
                  <p className="text-[10px] uppercase tracking-widest text-gray-400">Station {i + 1}</p>
                  <SafeText value={b.name} /> {done ? '✓' : ''}
                </div>
              );
            })}
          </div>
          <p className="text-sm text-gray-600">Scan the printed QR at each station with your phone camera.</p>
          <button
            type="button"
            className="text-sm font-semibold text-brand underline"
            onClick={() => {
              setShowTyped(true);
              setCodeError('');
            }}
          >
            Can&apos;t scan? Type the station code
          </button>
          {showTyped ? (
            <div className="space-y-2 rounded-2xl bg-gray-50 p-4">
              <label className="block text-sm font-medium">
                Station code
                <input
                  className={`${fieldClass(codeError)} mt-1`}
                  value={typedCode}
                  onChange={(e) => setTypedCode(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="characters"
                  maxLength={64}
                />
              </label>
              <FieldError message={codeError} />
              <div className="flex gap-2">
                <button type="button" className="flex-1 rounded-xl bg-white py-3 font-semibold" onClick={() => setShowTyped(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-xl bg-brand py-3 font-bold text-white"
                  disabled={busy}
                  onClick={() => void onTypedStamp()}
                >
                  {busy ? 'Stamping…' : 'Stamp'}
                </button>
              </div>
            </div>
          ) : (
            <FieldError message={codeError} />
          )}
          <button
            type="button"
            disabled={doneCount < needed}
            onClick={() => setStep('done')}
            className="w-full rounded-2xl bg-brand py-4 font-bold uppercase tracking-widest text-white disabled:bg-gray-200 disabled:text-gray-400"
          >
            {doneCount < needed ? `Scan ${needed - doneCount} more station${needed - doneCount === 1 ? '' : 's'}` : 'Show at the rewards counter'}
          </button>
          {!open ? <p className="text-sm text-amber-700">Check-in is not open right now.</p> : null}
          <MoreDetails>
            <p>Your stamps stay on this phone if you refresh. They belong to this event only.</p>
            <p>Need to change your details? Go back and edit before you finish check-in.</p>
            <button type="button" className="underline" onClick={() => setStep('details')}>
              Edit my details
            </button>
          </MoreDetails>
        </div>
        {flash ? <StampFlashCard flash={flash} onClose={() => setFlash(null)} /> : null}
      </Shell>
    );
  }

  return (
    <Shell>
      <Header subtitle={event ? headerDate : 'Open House'} />
      <div className="p-6 space-y-5">
        <h2 className="text-center text-2xl font-black">1Matunog District Open House</h2>
        {event ? (
          <p className="text-center text-gray-600">
            {formatManilaDate(event.eventDate)} · {event.venue || 'Cebu'}
          </p>
        ) : null}
        <button
          type="button"
          className="w-full rounded-2xl bg-brand py-4 text-sm font-bold uppercase tracking-widest text-white"
          onClick={() => setStep(submitted && doneCount >= needed ? 'done' : submitted ? 'passport' : 'details')}
          disabled={!event}
        >
          Start my passport
        </button>
        {returning ? (
          <div className="rounded-2xl bg-gray-50 p-4 text-sm">
            <p>
              Welcome back, <SafeText value={details.name} />
            </p>
            <button
              type="button"
              className="mt-2 font-semibold text-brand underline"
              onClick={() => {
                clearGuestProfile();
                if (event) {
                  clearPassportSession(event.id);
                  clearDeviceCheckin(event.id);
                }
                setDetails(emptyDetails);
                setStamped([]);
                setPersonId(undefined);
                setSubmitted(false);
                setReturning(false);
              }}
            >
              Not you? Clear
            </button>
          </div>
        ) : (
          <p className="text-center text-sm text-gray-500">Been here before? We only remember you on this phone.</p>
        )}
        <AdminLink />
      </div>
    </Shell>
  );
}

function StampFlashCard({ flash, onClose }: { flash: StampFlash; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-xl">
        {(() => {
          const copy = stampConfirmCopy(flash.kind, flash.stationNo, flash.doneCount, flash.needed);
          return (
            <>
              <p className={`text-4xl font-black ${flash.kind === 'already' ? 'text-gray-900' : 'text-green-700'}`}>
                {copy.title}
              </p>
              <p className={`mt-2 ${flash.kind === 'already' ? 'text-lg text-gray-600' : 'text-2xl font-bold text-gray-900'}`}>
                {copy.subtitle}
              </p>
            </>
          );
        })()}
        <SafeText className="mt-2 block text-sm text-gray-500" value={flash.name} />
        <div className="mx-auto mt-4 h-3 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-brand"
            style={{ width: `${flash.needed ? (flash.doneCount / flash.needed) * 100 : 0}%` }}
          />
        </div>
        <button type="button" className="mt-6 w-full rounded-2xl bg-brand py-4 font-bold text-white" onClick={onClose}>
          OK
        </button>
      </div>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="passport-shell">{children}</div>;
}

function Header({ subtitle }: { subtitle: string }) {
  return (
    <div className="bg-brand p-8 text-center text-white shadow-md">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">OPEN HOUSE</h1>
      <h2 className="text-xl font-light uppercase tracking-[0.2em] opacity-90">Passport</h2>
      <div className="mx-auto my-3 h-1 w-12 rounded-full bg-white/30" />
      <p className="text-[10px] font-semibold uppercase tracking-widest opacity-80 sm:text-xs">
        1Matunog District · {subtitle}
      </p>
    </div>
  );
}

function AdminLink() {
  return (
    <p className="pt-4 text-center">
      <Link to="/admin" className="text-[10px] uppercase tracking-[0.2em] text-gray-400 hover:text-brand">
        Admin sign-in
      </Link>
    </p>
  );
}
