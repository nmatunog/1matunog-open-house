import type { DeviceCheckin, GuestDetails, PassportSession, PendingStationScan } from '../types';

const PROFILE_KEY = 'oh_guest_profile';
const PENDING_SCAN_KEY = 'oh_pending_station_scan';
const sessionKey = (eventId: string) => `oh_passport_${eventId}`;
const deviceCheckinKey = (eventId: string) => `oh_checkin_${eventId}`;

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
    const raw = sessionStorage.getItem(sessionKey(eventId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PassportSession;
    if (!parsed || parsed.eventId !== eventId) return null;
    if (!Array.isArray(parsed.stampedBoothIds)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function savePassportSession(session: PassportSession): void {
  sessionStorage.setItem(sessionKey(session.eventId), JSON.stringify(session));
}

export function clearPassportSession(eventId: string): void {
  sessionStorage.removeItem(sessionKey(eventId));
}

export function loadDeviceCheckin(eventId: string): DeviceCheckin | null {
  try {
    const raw = localStorage.getItem(deviceCheckinKey(eventId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DeviceCheckin;
    if (!parsed || parsed.eventId !== eventId || typeof parsed.personId !== 'string') return null;
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
