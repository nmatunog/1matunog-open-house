import { doc, getDoc, serverTimestamp, setDoc, type Firestore } from 'firebase/firestore';
import { Timestamp } from 'firebase/firestore';
import { normalizeBoothCode, sha256Hex } from './hash';
import { randomBoothCode } from './booths';
import { stampDocId, stampKeyId } from './stations';
import { manilaDateTimeToDate, toDate } from './time';
import type { OhEvent } from '../types';

export const SUPER_CODE_SECRET_ID = 'all-stations';
export const SUPER_CODE_PREFIX = 'ALLSTATIONS:';

export async function superCodeEventHash(eventId: string, code: string): Promise<string> {
  return sha256Hex(`${eventId}|ALL|${normalizeBoothCode(code)}`);
}

export async function superCodeStampKeyId(eventId: string, code: string, boothId: string): Promise<string> {
  return stampKeyId(eventId, `${SUPER_CODE_PREFIX}${normalizeBoothCode(code)}:${boothId}`);
}

export function superCodeExpiryDate(event: Pick<OhEvent, 'checkInClosesAt' | 'eventDate'>): Date {
  const close = toDate(event.checkInClosesAt);
  const endOfDay = manilaDateTimeToDate(event.eventDate, '23:59');
  const times = [endOfDay.getTime()];
  if (close) times.push(close.getTime());
  return new Date(Math.min(...times));
}

export function superCodeStillValid(
  event: Pick<OhEvent, 'superCodeHash' | 'superCodeEnabled' | 'superCodeExpiresAt'>,
  now = new Date(),
): boolean {
  if (!event.superCodeEnabled || !event.superCodeHash) return false;
  const expires = toDate(event.superCodeExpiresAt);
  if (expires && now.getTime() > expires.getTime()) return false;
  return true;
}

export async function typedCodeIsSuperCode(event: OhEvent, typed: string): Promise<boolean> {
  if (!superCodeStillValid(event) || !typed.trim()) return false;
  const hash = await superCodeEventHash(event.id, typed);
  return hash === event.superCodeHash;
}

export function newSuperCode(): string {
  return randomBoothCode(6);
}

export type SuperCodeApplyResult =
  | { ok: true; boothIds: string[]; closed: boolean }
  | { ok: false; reason: 'off' | 'closed' | 'error'; message: string };

export async function applySuperCodeStamps(args: {
  db: Firestore;
  event: OhEvent;
  typed: string;
  anonUid: string;
  personId: string;
}): Promise<SuperCodeApplyResult> {
  if (!(await typedCodeIsSuperCode(args.event, args.typed))) {
    return { ok: false, reason: 'off', message: 'That code is not valid. Please see a host.' };
  }
  const boothIds: string[] = [];
  let closed = false;
  for (const booth of args.event.booths) {
    const stampKey = await superCodeStampKeyId(args.event.id, args.typed, booth.id);
    const keySnap = await getDoc(doc(args.db, 'oh_events', args.event.id, 'stampKeys', stampKey));
    if (!keySnap.exists()) continue;
    const stampId = stampDocId(args.anonUid, booth.id);
    const stampRef = doc(args.db, 'oh_events', args.event.id, 'stamps', stampId);
    const existing = await getDoc(stampRef);
    if (existing.exists()) {
      boothIds.push(booth.id);
      continue;
    }
    try {
      // Same five fields a guest scan writes. Published rules reject any extra key
      // (so source:'supercode' cannot be stored on the stamp document).
      await setDoc(stampRef, {
        boothId: booth.id,
        anonUid: args.anonUid,
        personId: args.personId,
        stampedAt: serverTimestamp(),
        stampKeyId: stampKey,
      });
      boothIds.push(booth.id);
    } catch {
      closed = true;
    }
  }
  if (boothIds.length === args.event.booths.length && args.event.booths.length > 0) {
    return { ok: true, boothIds, closed: false };
  }
  if (boothIds.length > 0) {
    return { ok: true, boothIds, closed };
  }
  return {
    ok: false,
    reason: closed ? 'closed' : 'error',
    message: closed
      ? 'A host needs to add your stamps from the guest list. Ask them to press Add stamps.'
      : 'That code is not valid. Please see a host.',
  };
}

export function superCodeEventFields(args: {
  hash: string;
  expiresAt: Date;
  enabled: boolean;
}): {
  superCodeHash: string;
  superCodeEnabled: boolean;
  superCodeExpiresAt: Timestamp;
} {
  return {
    superCodeHash: args.hash,
    superCodeEnabled: args.enabled,
    superCodeExpiresAt: Timestamp.fromDate(args.expiresAt),
  };
}

export const SUPER_CODE_SEE_HOST =
  'A host needs to add your stamps from the guest list. Ask them to press Add stamps.';
