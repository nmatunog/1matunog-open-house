import type { DeviceCheckin, GuestDetails, PassportSession, PendingStationScan } from '../types';

const PROFILE_KEY = 'oh_guest_profile';
const PENDING_SCAN_KEY = 'oh_pending_station_scan';
const sessionKey = (eventId: string) => `oh_passport_${eventId}`;
const deviceCheckinKey = (eventId: string) => `oh_checkin_${eventId}`;
export const stampListKey = (eventId: string, personId: string) => `oh_stamps_${eventId}_${personId}`;

function readJson(raw: string | null): unknown {
  if (!raw) return null;
  return JSON.parse(raw);
}

function asStringIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((id): id is string => typeof id === 'string' && Boolean(id));
}

export function loadGuestProfile(): GuestDetails | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GuestDetails;
    if (!parsed || typeof parsed.name !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveGuestProfile(details: GuestDetails): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(details));
}

export function clearGuestProfile(): void {
  localStorage.removeItem(PROFILE_KEY);
}

export function loadPassportSession(eventId: string): PassportSession | null {
  try {
    const key = sessionKey(eventId);
    let raw = localStorage.getItem(key);
    const legacy = !raw ? sessionStorage.getItem(key) : null;
    if (!raw && legacy) {
      raw = legacy;
      localStorage.setItem(key, legacy);
      sessionStorage.removeItem(key);
    }
    if (!raw) return null;
    const parsed = readJson(raw) as PassportSession;
    if (!parsed || parsed.eventId !== eventId) return null;
    if (!Array.isArray(parsed.stampedBoothIds)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function savePassportSession(session: PassportSession): void {
  const key = sessionKey(session.eventId);
  localStorage.setItem(key, JSON.stringify(session));
  sessionStorage.removeItem(key);
}

export function clearPassportSession(eventId: string): void {
  const key = sessionKey(eventId);
  localStorage.removeItem(key);
  sessionStorage.removeItem(key);
}

export function loadStampBoothIds(eventId: string, personId: string): string[] {
  try {
    const ids = asStringIds(readJson(localStorage.getItem(stampListKey(eventId, personId))));
    if (ids) return ids;
  } catch {
    // fall through to the passport session
  }
  const session = loadPassportSession(eventId);
  if (session && (!session.personId || session.personId === personId)) {
    return asStringIds(session.stampedBoothIds) ?? [];
  }
  return [];
}

export function saveStampBoothIds(eventId: string, personId: string, boothIds: string[]): void {
  localStorage.setItem(stampListKey(eventId, personId), JSON.stringify(boothIds));
}

export function clearStampBoothIds(eventId: string, personId: string): void {
  localStorage.removeItem(stampListKey(eventId, personId));
}

export function loadDeviceCheckin(eventId: string): DeviceCheckin | null {
  try {
    const raw = localStorage.getItem(deviceCheckinKey(eventId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DeviceCheckin;
    if (!parsed || parsed.eventId !== eventId || typeof parsed.personId !== 'string') return null;
    if (parsed.anonUid != null && typeof parsed.anonUid !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveDeviceCheckin(checkin: DeviceCheckin): void {
  localStorage.setItem(deviceCheckinKey(checkin.eventId), JSON.stringify(checkin));
}

export function clearDeviceCheckin(eventId: string): void {
  localStorage.removeItem(deviceCheckinKey(eventId));
}

export function loadPendingStationScan(): PendingStationScan | null {
  try {
    const raw = sessionStorage.getItem(PENDING_SCAN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingStationScan;
    if (!parsed?.eventId || !parsed.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function savePendingStationScan(scan: PendingStationScan): void {
  sessionStorage.setItem(PENDING_SCAN_KEY, JSON.stringify(scan));
}

export function clearPendingStationScan(): void {
  sessionStorage.removeItem(PENDING_SCAN_KEY);
}
