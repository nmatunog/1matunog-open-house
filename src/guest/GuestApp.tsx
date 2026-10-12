import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { signInAnonymously } from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { MoreDetails } from '../components/MoreDetails';
import { FieldError, fieldClass } from '../components/FieldError';
import { SafeText } from '../components/SafeText';
import { getFirebase } from '../firebase/app';
import { firebaseConfigReady, readFirebaseWebConfig } from '../firebase/config';
import { codeMatchesHash } from '../lib/booths';
import { encodeConsentVersion } from '../lib/consent';
import { eventCheckInOpen } from '../lib/eligibility';
import { isValidEmail, isValidInvitedBy, isValidName, normalizeEmail, personIdFromEmail } from '../lib/person';
import { formatPhoneInput, normalizePhPhone } from '../lib/phone';
import {
  clearGuestProfile,
  clearPassportSession,
  loadGuestProfile,
  loadPassportSession,
  saveGuestProfile,
  savePassportSession,
} from '../lib/storage';
import { formatManilaDate } from '../lib/time';
import type { GuestDetails, OhEvent, PassportSession } from '../types';
import { PrivacyNotice } from './PrivacyNotice';

type Step = 'welcome' | 'details' | 'passport' | 'done' | 'unavailable';

const emptyDetails: GuestDetails = {
  name: '',
  email: '',
  phone: '',
  invitedBy: '',
  privacyAgreed: false,
  marketingOptIn: false,
};

export function GuestApp() {
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
  const [codePrompt, setCodePrompt] = useState<string | null>(null);
  const [codeValue, setCodeValue] = useState('');
  const [codeError, setCodeError] = useState('');
  const [returning, setReturning] = useState(false);

  useEffect(() => {
    if (!configOk) return;
    const { db, auth } = getFirebase();
    void signInAnonymously(auth).catch(() => {
      setEventError('Could not start a guest session. Please refresh.');
    });
    const unsub = onSnapshot(
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
        const ev = await getDoc(doc(db, 'oh_events', currentEventId));
        if (!ev.exists()) {
          setEvent(null);
          setEventError('The published event could not be found.');
          return;
        }
        const data = ev.data() as Omit<OhEvent, 'id'>;
        const loaded: OhEvent = { id: ev.id, ...data, pendingDrawNo: data.pendingDrawNo ?? null, lastDrawNo: data.lastDrawNo ?? 0 };
        setEvent(loaded);
        setEventError('');
        const saved = loadPassportSession(loaded.id);
        const profile = loadGuestProfile();
        if (saved) {
          setDetails(saved.details);
          setStamped(saved.stampedBoothIds);
          setSubmitted(saved.submitted);
          setPersonId(saved.personId);
          if (saved.submitted) setStep('done');
          else if (saved.details.privacyAgreed) setStep('passport');
        } else if (profile) {
          setDetails(profile);
          setReturning(true);
        }
      },
      () => setEventError('Could not load the event. Please refresh.'),
    );
    return () => unsub();
  }, [configOk]);

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
  }, [event, details, stamped, submitted, personId]);

  const open = event ? eventCheckInOpen(event) : false;
  const needed = event?.booths.length ?? 0;
  const doneCount = stamped.length;

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

  function onDetailsNext() {
    if (!validateDetails()) return;
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
    setStep('passport');
  }

  async function stampBooth(boothId: string) {
    if (!event || stamped.includes(boothId)) return;
    const booth = event.booths.find((b) => b.id === boothId);
    if (!booth) return;
    const ok = await codeMatchesHash(codeValue, booth.codeHash);
    if (!ok) {
      setCodeError('That code does not match. Ask the presenter to type it.');
      return;
    }
    setStamped((prev) => [...prev, boothId]);
    setCodePrompt(null);
    setCodeValue('');
    setCodeError('');
  }

  async function submitPassport() {
    if (!event || !open) return;
    if (stamped.length < needed) return;
    setBusy(true);
    try {
      const { db, auth } = getFirebase();
      const uid = auth.currentUser?.uid;
      if (!uid) {
        await signInAnonymously(auth);
      }
      const anonUid = getFirebase().auth.currentUser?.uid;
      if (!anonUid) throw new Error('Not signed in');
      const pid = await personIdFromEmail(details.email);
      await setDoc(doc(db, 'oh_events', event.id, 'checkins', pid), {
        name: details.name.trim(),
        email: normalizeEmail(details.email),
        phone: details.phone,
        invitedBy: details.invitedBy.trim(),
        stampsCompleted: stamped.length,
        checkedInAt: serverTimestamp(),
        anonUid,
        consentVersion: encodeConsentVersion(details.marketingOptIn),
      });
      setPersonId(pid);
      setSubmitted(true);
      setStep('done');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.toLowerCase().includes('permission') || message.toLowerCase().includes('already')) {
        setSubmitted(true);
        setStep('done');
      } else {
        setErrors({ submit: 'Could not check you in. Please find a host.' });
      }
    } finally {
      setBusy(false);
    }
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
            <SafeText as="h2" className="mt-2 text-3xl font-black" value={details.name || 'Guest'} />
            <p className="mt-2 text-sm">
              {formatManilaDate(event.eventDate)} · {doneCount}/{needed} booths
            </p>
          </div>
          <p className="text-gray-700 font-medium">Show this screen at the rewards counter.</p>
          {submitted && (
            <p className="text-green-700 font-semibold">You&apos;re already checked in. ✓</p>
          )}
          <button
            type="button"
            className="w-full rounded-2xl bg-gray-900 py-3 font-bold text-white"
            onClick={() => setStep('welcome')}
          >
            Close
          </button>
        </div>
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
            onDetailsNext();
          }}
        >
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
          <button type="submit" className="w-full rounded-2xl bg-brand py-4 font-bold uppercase tracking-widest text-white">
            Next
          </button>
        </form>
      </Shell>
    );
  }

  if (step === 'passport' && event) {
    const booth = event.booths.find((b) => b.id === codePrompt);
    return (
      <Shell>
        <Header subtitle={headerDate} />
        <div className="p-6 space-y-4">
          <p className="text-lg font-semibold">
            Hi, <SafeText value={details.name.split(' ')[0] || 'friend'} />! {doneCount} of {needed} booths
          </p>
          <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-brand transition-all"
              style={{ width: `${needed ? (doneCount / needed) * 100 : 0}%` }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {event.booths.map((b) => {
              const done = stamped.includes(b.id);
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    if (done) return;
                    setCodePrompt(b.id);
                    setCodeValue('');
                    setCodeError('');
                  }}
                  className={`rounded-2xl border-2 p-4 text-left font-semibold ${
                    done ? 'border-green-500 bg-green-50 text-green-800' : 'border-dashed border-pink-300 bg-rose-50'
                  }`}
                >
                  <SafeText value={b.name} /> {done ? '✓' : ''}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-500">Tap a booth → presenter enters code</p>
          <button
            type="button"
            disabled={doneCount < needed || busy || !open}
            onClick={() => void submitPassport()}
            className="w-full rounded-2xl bg-brand py-4 font-bold uppercase tracking-widest text-white disabled:bg-gray-200 disabled:text-gray-400"
          >
            {busy ? 'Checking in…' : doneCount < needed ? 'Visit every booth first' : 'Submit'}
          </button>
          <FieldError message={errors.submit} />
          {!open ? <p className="text-sm text-amber-700">Check-in is not open right now.</p> : null}
          <MoreDetails>
            <p>Your stamps stay on this phone if you refresh. They belong to this event only.</p>
            <p>Need to change your details? Go back and edit before you submit.</p>
            <button type="button" className="underline" onClick={() => setStep('details')}>
              Edit my details
            </button>
          </MoreDetails>
        </div>
        {booth ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
            <div className="w-full max-w-md rounded-2xl bg-white p-5">
              <h3 className="font-bold">Presenter code</h3>
              <p className="text-sm text-gray-600">
                Ask the presenter at <SafeText value={booth.name} /> to type the booth code.
              </p>
              <input
                className={fieldClass(codeError)}
                value={codeValue}
                onChange={(e) => setCodeValue(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
              />
              <FieldError message={codeError} />
              <div className="mt-3 flex gap-2">
                <button type="button" className="flex-1 rounded-xl bg-gray-100 py-3 font-semibold" onClick={() => setCodePrompt(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-xl bg-brand py-3 font-bold text-white"
                  onClick={() => void stampBooth(booth.id)}
                >
                  Stamp
                </button>
              </div>
            </div>
          </div>
        ) : null}
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
          onClick={() => setStep('details')}
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
                if (event) clearPassportSession(event.id);
                setDetails(emptyDetails);
                setStamped([]);
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

