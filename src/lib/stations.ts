import type { Firestore } from 'firebase/firestore';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import type { StationStamp } from '../types';
import { hashBoothCode, normalizeBoothCode, sha256Hex } from './hash';
import { randomBoothCode, type BoothDraft } from './booths';

/** 16 random bytes = 128 bits, encoded as 32 hex chars. */
export const STATION_TOKEN_BYTES = 16;

export type StationSecret = {
  boothId: string;
  token: string;
  shortCode: string;
};

export type StampKeyRecord = {
  id: string;
  boothId: string;
  eventId: string;
};

export type { StationStamp };

export type StationMaterials = {
  booths: { id: string; name: string; codeHash: string }[];
  secrets: StationSecret[];
  stampKeys: StampKeyRecord[];
};

export function randomStationToken(bytes = STATION_TOKEN_BYTES): string {
  const buf = new Uint8Array(Math.max(bytes, STATION_TOKEN_BYTES));
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function tokenBitLength(token: string): number {
  if (!/^[0-9a-f]+$/i.test(token) || token.length % 2 !== 0) return 0;
  return (token.length / 2) * 8;
}

/** Doc id guests can get-by-id if they already know the secret. Never list this collection for guests. */
export async function stampKeyId(eventId: string, secret: string): Promise<string> {
  return sha256Hex(eventId + secret);
}

export function stampDocId(anonUid: string, boothId: string): string {
  return `${anonUid}_${boothId}`;
}

/** Live guest site. Printed cards always encode this — never localhost, a preview, or Firebase Hosting. */
export const PRODUCTION_SITE_ORIGIN = 'https://aia-openhouse.netlify.app';

export function isUnsafeQrOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') return true;
    if (host.endsWith('.firebaseapp.com') || host.endsWith('.web.app')) return true;
    if (host !== 'aia-openhouse.netlify.app') return true;
    return url.protocol !== 'https:';
  } catch {
    return true;
  }
}

export function printedStationOrigin(candidate?: string): string {
  if (candidate && !isUnsafeQrOrigin(candidate)) return candidate.replace(/\/+$/, '');
  return PRODUCTION_SITE_ORIGIN;
}

/** QR payload helper. Printed cards must call printedStationQrUrl, not a local origin. */
export function stationQrUrl(origin: string, eventId: string, token: string): string {
  const base = origin.replace(/\/+$/, '');
  return `${base}/s/${encodeURIComponent(eventId)}/${encodeURIComponent(token)}`;
}

export function printedStationQrUrl(eventId: string, token: string): string {
  return stationQrUrl(PRODUCTION_SITE_ORIGIN, eventId, token);
}

export function parseStationPath(pathname: string): { eventId: string; token: string } | null {
  const match = pathname.match(/^\/s\/([^/]+)\/([^/]+)\/?$/);
  if (!match?.[1] || !match[2]) return null;
  try {
    return { eventId: decodeURIComponent(match[1]), token: decodeURIComponent(match[2]) };
  } catch {
    return null;
  }
}

export async function buildStationMaterials(
  eventId: string,
  drafts: BoothDraft[],
): Promise<StationMaterials> {
  const named = drafts.filter((b) => b.name.trim());
  const booths: StationMaterials['booths'] = [];
  const secrets: StationSecret[] = [];
  const stampKeys: StampKeyRecord[] = [];

  for (const draft of named) {
    const shortCode = normalizeBoothCode(draft.code) || randomBoothCode();
    const token = randomStationToken();
    const boothId = draft.id;
    booths.push({
      id: boothId,
      name: draft.name.trim(),
      codeHash: await hashBoothCode(shortCode),
    });
    secrets.push({ boothId, token, shortCode });
    const qrKeyId = await stampKeyId(eventId, token);
    const codeKeyId = await stampKeyId(eventId, shortCode);
    stampKeys.push({ id: qrKeyId, boothId, eventId }, { id: codeKeyId, boothId, eventId });
  }

  return { booths, secrets, stampKeys };
}

export async function writeStationMaterials(
  db: Firestore,
  eventId: string,
  materials: StationMaterials,
  options: { rotate?: boolean } = {},
): Promise<void> {
  if (options.rotate) {
    const oldKeys = await getDocs(collection(db, 'oh_events', eventId, 'stampKeys'));
    await Promise.all(oldKeys.docs.map((d) => deleteDoc(d.ref)));
  }

  const batch = writeBatch(db);
  for (const secret of materials.secrets) {
    batch.set(doc(db, 'oh_events', eventId, 'stationSecrets', secret.boothId), {
      token: secret.token,
      shortCode: secret.shortCode,
    });
  }
  for (const key of materials.stampKeys) {
    batch.set(doc(db, 'oh_events', eventId, 'stampKeys', key.id), {
      boothId: key.boothId,
      eventId: key.eventId,
    });
  }
  await batch.commit();
}

export async function rotateStationMaterials(
  db: Firestore,
  event: { id: string; booths: { id: string; name: string }[] },
): Promise<StationSecret[]> {
  const drafts: BoothDraft[] = event.booths.map((b) => ({
    id: b.id,
    name: b.name,
    code: randomBoothCode(),
  }));
  const materials = await buildStationMaterials(event.id, drafts);
  await setDoc(doc(db, 'oh_events', event.id), { booths: materials.booths }, { merge: true });
  await writeStationMaterials(db, event.id, materials, { rotate: true });
  return materials.secrets;
}

export async function ensureStationMaterials(
  db: Firestore,
  event: { id: string; booths: { id: string; name: string }[] },
): Promise<{ secrets: StationSecret[]; created: boolean }> {
  const existing = await loadStationSecrets(db, event.id);
  const have = new Set(existing.filter((s) => s.token && s.shortCode).map((s) => s.boothId));
  const missing = event.booths.filter((b) => !have.has(b.id));
  if (missing.length === 0 && existing.length > 0) {
    return { secrets: existing, created: false };
  }
  const drafts: BoothDraft[] = event.booths.map((b) => ({
    id: b.id,
    name: b.name,
    code: randomBoothCode(),
  }));
  const materials = await buildStationMaterials(event.id, drafts);
  await setDoc(
    doc(db, 'oh_events', event.id),
    { booths: materials.booths },
    { merge: true },
  );
  await writeStationMaterials(db, event.id, materials, { rotate: existing.length > 0 });
  return { secrets: materials.secrets, created: true };
}

export async function loadStationSecrets(
  db: Firestore,
  eventId: string,
): Promise<StationSecret[]> {
  const snap = await getDocs(collection(db, 'oh_events', eventId, 'stationSecrets'));
  return snap.docs.map((d) => {
    const data = d.data() as { token?: string; shortCode?: string };
    return {
      boothId: d.id,
      token: String(data.token ?? ''),
      shortCode: String(data.shortCode ?? ''),
    };
  });
}

export async function lookupStampKey(
  db: Firestore,
  eventId: string,
  secret: string,
): Promise<{ stampKeyId: string; boothId: string } | null> {
  const trimmed = secret.trim();
  if (!trimmed) return null;
  const candidates = [...new Set([trimmed, normalizeBoothCode(trimmed)].filter(Boolean))];
  for (const candidate of candidates) {
    const id = await stampKeyId(eventId, candidate);
    const snap = await getDoc(doc(db, 'oh_events', eventId, 'stampKeys', id));
    if (snap.exists()) {
      const boothId = String((snap.data() as { boothId?: string }).boothId ?? '');
      if (boothId) return { stampKeyId: id, boothId };
    }
  }
  return null;
}

export function parseStamp(id: string, data: Record<string, unknown>): StationStamp {
  return {
    id,
    boothId: String(data.boothId ?? ''),
    personId: String(data.personId ?? ''),
    anonUid: String(data.anonUid ?? ''),
    stampKeyId: String(data.stampKeyId ?? ''),
  };
}

export function countStampsByPerson(stamps: { personId: string }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const stamp of stamps) {
    if (!stamp.personId) continue;
    map.set(stamp.personId, (map.get(stamp.personId) ?? 0) + 1);
  }
  return map;
}

export function countStampsByBooth(stamps: { boothId: string }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const stamp of stamps) {
    if (!stamp.boothId) continue;
    map.set(stamp.boothId, (map.get(stamp.boothId) ?? 0) + 1);
  }
  return map;
}

export function stampCountFor(personId: string, counts: Map<string, number>): number {
  return counts.get(personId) ?? 0;
}
