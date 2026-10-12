import { doc, getDoc, serverTimestamp, setDoc, type Firestore } from 'firebase/firestore';
import { lookupStampKey, stampDocId } from '../lib/stations';

export function stampConfirmCopy(
  kind: 'stamped' | 'already',
  stationNo: number,
  doneCount: number,
  needed: number,
): { title: string; subtitle: string } {
  if (kind === 'already') {
    return { title: 'Already stamped', subtitle: `Station ${stationNo} · ${doneCount} of ${needed}` };
  }
  return { title: `Station ${stationNo} stamped!`, subtitle: `${doneCount} of ${needed}` };
}

export type StampApplyResult =
  | { ok: true; status: 'stamped' | 'already'; boothId: string; stampKeyId: string }
  | { ok: false; reason: 'invalid' | 'closed' | 'no-checkin' | 'error'; message: string };

export async function applyStationStamp(args: {
  db: Firestore;
  eventId: string;
  token: string;
  anonUid: string;
  personId: string;
}): Promise<StampApplyResult> {
  const key = await lookupStampKey(args.db, args.eventId, args.token);
  if (!key) {
    return { ok: false, reason: 'invalid', message: 'This station card is not valid. Please see a host.' };
  }

  const stampId = stampDocId(args.anonUid, key.boothId);
  const stampRef = doc(args.db, 'oh_events', args.eventId, 'stamps', stampId);
  const existing = await getDoc(stampRef);
  if (existing.exists()) {
    return { ok: true, status: 'already', boothId: key.boothId, stampKeyId: key.stampKeyId };
  }

  try {
    await setDoc(stampRef, {
      boothId: key.boothId,
      anonUid: args.anonUid,
      personId: args.personId,
      stampedAt: serverTimestamp(),
      stampKeyId: key.stampKeyId,
    });
    return { ok: true, status: 'stamped', boothId: key.boothId, stampKeyId: key.stampKeyId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const lower = message.toLowerCase();
    if (lower.includes('permission') || lower.includes('insufficient')) {
      const again = await getDoc(stampRef);
      if (again.exists()) {
        return { ok: true, status: 'already', boothId: key.boothId, stampKeyId: key.stampKeyId };
      }
      return {
        ok: false,
        reason: 'closed',
        message: 'This station is closed right now. Please see a host.',
      };
    }
    return { ok: false, reason: 'error', message: 'Could not stamp this station. Please see a host.' };
  }
}
