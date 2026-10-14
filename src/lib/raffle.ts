import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import { projectorName } from './displayName';
import { eligiblePool } from './eligibility';
import { parseAdminBoothIds } from './adminStamps';
import { mergeAdminAndScanCounts, parseStamp } from './stations';
import type { Checkin, Draw, OhEvent, WinnerLock } from '../types';
import { toDate } from './time';
import { Timestamp } from 'firebase/firestore';

export function pickIndex(length: number): number {
  if (length <= 0) throw new Error('empty pool');
  const max = 0x100000000;
  const limit = max - (max % length);
  const buf = new Uint32Array(1);
  let x = 0;
  do {
    crypto.getRandomValues(buf);
    x = buf[0] ?? 0;
  } while (x >= limit);
  return x % length;
}

export function pickFromPool<T>(pool: T[]): T {
  const item = pool[pickIndex(pool.length)];
  if (item === undefined) throw new Error('empty pool');
  return item;
}

function asEvent(id: string, data: Record<string, unknown>): OhEvent {
  const raffle = (data.raffle ?? {}) as Record<string, unknown>;
  return {
    id,
    name: String(data.name ?? ''),
    venue: String(data.venue ?? ''),
    eventDate: String(data.eventDate ?? ''),
    checkInOpensAt: data.checkInOpensAt as OhEvent['checkInOpensAt'],
    checkInClosesAt: data.checkInClosesAt as OhEvent['checkInClosesAt'],
    raffle: {
      opensAt: raffle.opensAt as OhEvent['raffle']['opensAt'],
      closesAt: raffle.closesAt as OhEvent['raffle']['closesAt'],
      minStamps: Number(raffle.minStamps ?? 0),
      allowRepeatWinners: raffle.allowRepeatWinners === true,
      prizes: Array.isArray(raffle.prizes) ? (raffle.prizes as string[]) : [],
    },
    booths: Array.isArray(data.booths) ? (data.booths as OhEvent['booths']) : [],
    status: data.status as OhEvent['status'],
    createdBy: String(data.createdBy ?? ''),
    pendingDrawNo: (data.pendingDrawNo as number | null | undefined) ?? null,
    lastDrawNo: Number(data.lastDrawNo ?? 0),
    superCodeHash: typeof data.superCodeHash === 'string' ? data.superCodeHash : undefined,
    superCodeEnabled: data.superCodeEnabled === true,
    superCodeExpiresAt: data.superCodeExpiresAt as OhEvent['superCodeExpiresAt'],
  };
}

export function parseCheckin(id: string, data: Record<string, unknown>): Checkin {
  return {
    personId: id,
    name: String(data.name ?? ''),
    email: String(data.email ?? ''),
    phone: String(data.phone ?? ''),
    invitedBy: String(data.invitedBy ?? ''),
    stampsCompleted: Number(data.stampsCompleted ?? 0),
    checkedInAt: data.checkedInAt as Checkin['checkedInAt'],
    anonUid: String(data.anonUid ?? ''),
    consentVersion: String(data.consentVersion ?? ''),
    adminBoothIds: parseAdminBoothIds(data.adminBoothIds),
    adminStampBy: typeof data.adminStampBy === 'string' ? data.adminStampBy : undefined,
    adminStampSource: data.adminStampSource === 'admin' ? 'admin' : undefined,
  };
}

export function parseWinner(id: string, data: Record<string, unknown>): WinnerLock {
  return {
    personId: id,
    drawNo: Number(data.drawNo ?? 0),
    status: (data.status as WinnerLock['status']) ?? 'pending',
  };
}

export function parseDraw(id: string, data: Record<string, unknown>): Draw {
  return {
    id,
    personId: String(data.personId ?? ''),
    displayName: String(data.displayName ?? ''),
    invitedBy: String(data.invitedBy ?? ''),
    prize: String(data.prize ?? ''),
    drawnAt: data.drawnAt as Draw['drawnAt'],
    drawnBy: String(data.drawnBy ?? ''),
    status: (data.status as Draw['status']) ?? 'pending',
    resolvedAt: (data.resolvedAt as Draw['resolvedAt']) ?? null,
  };
}

export async function loadLivePool(
  db: Firestore,
  eventId: string,
): Promise<{ event: OhEvent; checkins: Checkin[]; winners: Map<string, WinnerLock>; pool: Checkin[] }> {
  const eventSnap = await getDoc(doc(db, 'oh_events', eventId));
  if (!eventSnap.exists()) throw new Error('Event not found');
  const event = asEvent(eventSnap.id, eventSnap.data() as Record<string, unknown>);
  const [checkinSnaps, winnerSnaps, stampSnaps] = await Promise.all([
    getDocs(collection(db, 'oh_events', eventId, 'checkins')),
    getDocs(collection(db, 'oh_events', eventId, 'winners')),
    getDocs(collection(db, 'oh_events', eventId, 'stamps')),
  ]);
  const checkins = checkinSnaps.docs.map((d) => parseCheckin(d.id, d.data() as Record<string, unknown>));
  const winners = new Map<string, WinnerLock>();
  for (const d of winnerSnaps.docs) {
    winners.set(d.id, parseWinner(d.id, d.data() as Record<string, unknown>));
  }
  const stampCounts = mergeAdminAndScanCounts(
    stampSnaps.docs.map((d) => parseStamp(d.id, d.data() as Record<string, unknown>)),
    checkins,
  );
  return { event, checkins, winners, pool: eligiblePool(checkins, event, winners, stampCounts) };
}

export type DrawResult =
  | { ok: true; drawNo: number; personId: string; displayName: string; invitedBy: string; prize: string }
  | { ok: false; reason: 'empty' | 'pending' | 'conflict' };

export async function drawAndLock(
  db: Firestore,
  eventId: string,
  drawnBy: string,
  prize = '',
): Promise<DrawResult> {
  const live = await loadLivePool(db, eventId);
  if (live.event.pendingDrawNo != null) return { ok: false, reason: 'pending' };
  if (live.pool.length === 0) return { ok: false, reason: 'empty' };

  let remaining = [...live.pool];
  while (remaining.length > 0) {
    const pick = pickFromPool(remaining);
    remaining = remaining.filter((c) => c.personId !== pick.personId);
    try {
      const result = await runTransaction(db, async (tx) => {
        const eventRef = doc(db, 'oh_events', eventId);
        const eventSnap = await tx.get(eventRef);
        if (!eventSnap.exists()) throw new Error('Event not found');
        const event = asEvent(eventSnap.id, eventSnap.data() as Record<string, unknown>);
        if (event.pendingDrawNo != null) {
          return { ok: false, reason: 'pending' } as const;
        }
        const winnerRef = doc(db, 'oh_events', eventId, 'winners', pick.personId);
        const winnerSnap = await tx.get(winnerRef);
        if (winnerSnap.exists()) {
          const lock = parseWinner(winnerSnap.id, winnerSnap.data() as Record<string, unknown>);
          const canRepeat =
            event.raffle.allowRepeatWinners && lock.status === 'claimed';
          if (!canRepeat) {
            throw new Error('ALREADY_WON');
          }
        }
        const drawNo = event.lastDrawNo + 1;
        const display = projectorName(pick.name);
        const prizeLabel = prize || event.raffle.prizes[0] || '';
        const drawRef = doc(db, 'oh_events', eventId, 'draws', String(drawNo));
        tx.update(eventRef, { pendingDrawNo: drawNo, lastDrawNo: drawNo });
        tx.set(drawRef, {
          personId: pick.personId,
          displayName: display,
          invitedBy: pick.invitedBy,
          prize: prizeLabel,
          drawnAt: serverTimestamp(),
          drawnBy,
          status: 'pending',
          resolvedAt: null,
        });
        if (winnerSnap.exists()) {
          tx.update(winnerRef, { drawNo, status: 'pending' });
        } else {
          tx.set(winnerRef, { personId: pick.personId, drawNo, status: 'pending' });
        }
        return {
          ok: true,
          drawNo,
          personId: pick.personId,
          displayName: display,
          invitedBy: pick.invitedBy,
          prize: prizeLabel,
        } as const;
      });
      if (!result.ok) return result;
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('ALREADY_WON')) continue;
      throw err;
    }
  }
  return { ok: false, reason: 'empty' };
}

export async function resolvePendingDraw(
  db: Firestore,
  eventId: string,
  status: 'claimed' | 'no_show',
): Promise<{ drawNo: number; personId: string } | null> {
  return runTransaction(db, async (tx) => {
    const eventRef = doc(db, 'oh_events', eventId);
    const eventSnap = await tx.get(eventRef);
    if (!eventSnap.exists()) throw new Error('Event not found');
    const event = asEvent(eventSnap.id, eventSnap.data() as Record<string, unknown>);
    const drawNo = event.pendingDrawNo;
    if (drawNo == null) return null;
    const drawRef = doc(db, 'oh_events', eventId, 'draws', String(drawNo));
    const drawSnap = await tx.get(drawRef);
    if (!drawSnap.exists()) {
      tx.update(eventRef, { pendingDrawNo: null });
      return null;
    }
    const draw = parseDraw(drawSnap.id, drawSnap.data() as Record<string, unknown>);
    const winnerRef = doc(db, 'oh_events', eventId, 'winners', draw.personId);
    tx.update(drawRef, { status, resolvedAt: serverTimestamp() });
    tx.update(winnerRef, { status });
    tx.update(eventRef, { pendingDrawNo: null });
    return { drawNo, personId: draw.personId };
  });
}

export function pendingDrawOf(draws: Draw[], pendingDrawNo: number | null): Draw | null {
  if (pendingDrawNo == null) return null;
  return draws.find((d) => d.id === String(pendingDrawNo) && d.status === 'pending') ?? null;
}

export function spinNames(pool: Checkin[], frames = 12): string[] {
  if (pool.length === 0) return [];
  return Array.from({ length: frames }, () => projectorName(pickFromPool(pool).name));
}

export function checkedInAtMs(checkin: Checkin): number {
  return toDate(checkin.checkedInAt)?.getTime() ?? 0;
}

export function asTimestamp(date: Date): Timestamp {
  return Timestamp.fromDate(date);
}
