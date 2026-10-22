import { signInAnonymously, type Auth } from 'firebase/auth';
import { doc, getDoc, type Firestore } from 'firebase/firestore';
import { stampDocId } from '../lib/stations';

export const STAMPS_LOADING_MESSAGE = 'Loading your stamps…';
export const STAMPS_REFRESH_NOTE = "Couldn't refresh stamps — showing saved ones.";
export const GUEST_SESSION_LOST_MESSAGE =
  'This browser lost your session — open the passport in the same browser you checked in with, or see a host.';

export type StampDocSnap = {
  exists: boolean;
  boothId?: string;
  personId?: string;
};

/** Guest-legal read: get-by-id only. Published rules forbid listing `/stamps`. */
export type StampDocReader = (stampId: string) => Promise<StampDocSnap>;

/**
 * Wait for a restored anonymous session before signing in a new one.
 * A camera-app scan is a fresh page load; racing sign-in against Auth
 * persistence would look up stamps under the wrong uid.
 */
export async function waitForGuestUid(auth: {
  currentUser: { uid: string } | null;
  authStateReady: () => Promise<void>;
}): Promise<string> {
  await auth.authStateReady();
  if (auth.currentUser?.uid) return auth.currentUser.uid;
  const cred = await signInAnonymously(auth as Auth);
  if (!cred.user?.uid) throw new Error('Could not start a guest session');
  return cred.user.uid;
}

export function uniqueStationIds(boothIds: Iterable<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of boothIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function mergeStationIds(...lists: Array<Iterable<string>>): string[] {
  return uniqueStationIds(lists.flatMap((list) => [...list]));
}

/** Keep in-memory stamps only for the same event+person, and only booths on this event. */
export function scopedStampBoothIds(args: {
  booths: { id: string }[];
  savedIds: Iterable<string>;
  inMemoryIds?: Iterable<string>;
  sameOwner: boolean;
}): string[] {
  const allowed = new Set(args.booths.map((booth) => booth.id));
  return mergeStationIds(args.sameOwner ? args.inMemoryIds ?? [] : [], args.savedIds).filter((id) =>
    allowed.has(id),
  );
}

export type StampProgress =
  | { loading: true }
  | { loading: false; boothIds: string[]; doneCount: number };

/**
 * Progress is hidden until stamp documents for this person and event have
 * been read. The count is the number of unique stations among those docs,
 * plus a station just written on this scan so a stale read cannot shrink it.
 */
export function stampProgressFromDocs(args: {
  loaded: boolean;
  stampBoothIds: string[];
  justAppliedBoothId?: string;
}): StampProgress {
  if (!args.loaded) return { loading: true };
  const boothIds = mergeStationIds(
    args.stampBoothIds,
    args.justAppliedBoothId ? [args.justAppliedBoothId] : [],
  );
  return { loading: false, boothIds, doneCount: boothIds.length };
}

export function firestoreStampReader(db: Firestore, eventId: string): StampDocReader {
  return async (stampId) => {
    const snap = await getDoc(doc(db, 'oh_events', eventId, 'stamps', stampId));
    if (!snap.exists()) return { exists: false };
    const data = snap.data() as { boothId?: string; personId?: string };
    return {
      exists: true,
      boothId: data.boothId,
      personId: data.personId,
    };
  };
}

export type StampLoadResult = {
  boothIds: string[];
  failedBoothIds: string[];
  failed: boolean;
};

/** One get-by-id per station (`{anonUid}_{boothId}`). Never a collection list. */
export async function loadStampBoothIdsFromDocs(args: {
  booths: { id: string }[];
  anonUid: string;
  personId: string;
  readStamp: StampDocReader;
}): Promise<StampLoadResult> {
  const settled = await Promise.allSettled(
    args.booths.map(async (booth) => {
      const snap = await args.readStamp(stampDocId(args.anonUid, booth.id));
      if (!snap.exists) return null;
      if (snap.personId && snap.personId !== args.personId) return null;
      return booth.id;
    }),
  );

  const boothIds: string[] = [];
  const failedBoothIds: string[] = [];
  settled.forEach((result, index) => {
    const boothId = args.booths[index]?.id;
    if (result.status === 'rejected') {
      if (boothId) failedBoothIds.push(boothId);
      return;
    }
    if (result.value) boothIds.push(result.value);
  });

  return {
    boothIds: uniqueStationIds(boothIds),
    failedBoothIds: uniqueStationIds(failedBoothIds),
    failed: failedBoothIds.length > 0,
  };
}
