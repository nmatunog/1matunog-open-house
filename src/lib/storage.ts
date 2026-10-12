import type { GuestDetails, PassportSession } from '../types';

const PROFILE_KEY = 'oh_guest_profile';
const sessionKey = (eventId: string) => `oh_passport_${eventId}`;

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
