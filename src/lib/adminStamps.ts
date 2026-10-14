import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, type Firestore } from 'firebase/firestore';
import { uniqueStationIds } from '../guest/guestStamps';
import { stampDocId } from './stations';

/** Same fields the guest scan writes, plus source so we can tell an admin added it. */
export const ADMIN_STAMP_SOURCE = 'admin' as const;

export type AdminStampFields = {
  boothId: string;
  anonUid: string;
  personId: string;
  stampedAt: ReturnType<typeof serverTimestamp>;
  stampKeyId: string;
  source: typeof ADMIN_STAMP_SOURCE;
};

export function adminStampFields(args: {
  boothId: string;
  anonUid: string;
  personId: string;
  stampKeyId: string;
}): AdminStampFields {
  return {
    boothId: args.boothId,
    anonUid: args.anonUid,
    personId: args.personId,
    stampedAt: serverTimestamp(),
    stampKeyId: args.stampKeyId,
    source: ADMIN_STAMP_SOURCE,
  };
}

export function boothIdsDoneForPerson(
  stamps: { personId: string; boothId?: string }[],
  personId: string,
): string[] {
  return uniqueStationIds(
    stamps.filter((s) => s.personId === personId && s.boothId).map((s) => s.boothId as string),
  );
}

export function stationsStillOpen(allBoothIds: string[], doneBoothIds: Iterable<string>): string[] {
  const done = new Set(doneBoothIds);
  return allBoothIds.filter((id) => id && !done.has(id));
}

export function shouldShowAddStamps(args: { isAdmin: boolean; uniqueStations: number; needed: number }): boolean {
  return args.isAdmin && args.needed > 0 && args.uniqueStations < args.needed;
}

export async function loadBoothStampKeyIds(db: Firestore, eventId: string): Promise<Map<string, string>> {
  const snap = await getDocs(collection(db, 'oh_events', eventId, 'stampKeys'));
  const map = new Map<string, string>();
  for (const row of snap.docs) {
    const boothId = String((row.data() as { boothId?: string }).boothId ?? '');
    if (boothId && !map.has(boothId)) map.set(boothId, row.id);
  }
  return map;
}

export async function writeAdminStationStamps(args: {
  db: Firestore;
  eventId: string;
  personId: string;
  anonUid: string;
  boothIds: string[];
  stampKeyIdByBooth?: Map<string, string>;
}): Promise<{ written: string[]; already: string[] }> {
  const boothIds = uniqueStationIds(args.boothIds);
  const keyByBooth = args.stampKeyIdByBooth ?? (await loadBoothStampKeyIds(args.db, args.eventId));
  const written: string[] = [];
  const already: string[] = [];

  for (const boothId of boothIds) {
    const stampKeyId = keyByBooth.get(boothId);
    if (!stampKeyId) {
      throw new Error('Could not find a station key to save that stamp.');
    }
    const stampId = stampDocId(args.anonUid, boothId);
    const ref = doc(args.db, 'oh_events', args.eventId, 'stamps', stampId);
    const existing = await getDoc(ref);
    if (existing.exists()) {
      already.push(boothId);
      continue;
    }
    await setDoc(ref, adminStampFields({
      boothId,
      anonUid: args.anonUid,
      personId: args.personId,
      stampKeyId,
    }));
    written.push(boothId);
  }

  return { written, already };
}
