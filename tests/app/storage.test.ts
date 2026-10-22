import { afterEach, describe, expect, it } from 'vitest';
import {
  clearDeviceCheckin,
  clearPassportSession,
  clearPendingStationScan,
  clearStampBoothIds,
  loadDeviceCheckin,
  loadPassportSession,
  loadPendingStationScan,
  loadStampBoothIds,
  saveDeviceCheckin,
  savePassportSession,
  savePendingStationScan,
  saveStampBoothIds,
  stampListKey,
} from '../../src/lib/storage';
import type { PassportSession } from '../../src/types';

const sample = (eventId: string, stamped: string[]): PassportSession => ({
  eventId,
  details: {
    name: 'Juan Dela Cruz',
    email: 'juan@example.com',
    phone: '+639171234567',
    invitedBy: 'Ana',
    privacyAgreed: true,
    marketingOptIn: false,
  },
  stampedBoothIds: stamped,
  submitted: false,
});

describe('refresh-keeps-stamps', () => {
  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('keeps booth stamps for the same event after a simulated refresh', () => {
    savePassportSession(sample('evt-1', ['booth-1', 'booth-2', 'booth-3']));
    const restored = loadPassportSession('evt-1');
    expect(restored?.stampedBoothIds).toEqual(['booth-1', 'booth-2', 'booth-3']);
    expect(restored?.details.name).toBe('Juan Dela Cruz');
  });

  it('does not leak stamps into a different event', () => {
    savePassportSession(sample('evt-1', ['booth-1']));
    expect(loadPassportSession('evt-2')).toBeNull();
  });

  it('can clear a session', () => {
    savePassportSession(sample('evt-1', ['booth-1']));
    clearPassportSession('evt-1');
    expect(loadPassportSession('evt-1')).toBeNull();
  });

  it('remembers check-in on this device across a refresh', () => {
    saveDeviceCheckin({ eventId: 'evt-1', personId: 'p1', name: 'Juan' });
    expect(loadDeviceCheckin('evt-1')?.personId).toBe('p1');
    clearDeviceCheckin('evt-1');
    expect(loadDeviceCheckin('evt-1')).toBeNull();
  });

  it('keeps a scanned station until check-in finishes', () => {
    savePendingStationScan({ eventId: 'evt-1', token: 'deadbeef' });
    expect(loadPendingStationScan()).toEqual({ eventId: 'evt-1', token: 'deadbeef' });
    clearPendingStationScan();
    expect(loadPendingStationScan()).toBeNull();
  });

  it('persists the passport session in localStorage, not sessionStorage', () => {
    savePassportSession(sample('evt-1', ['booth-1']));
    expect(localStorage.getItem('oh_passport_evt-1')).toBeTruthy();
    expect(sessionStorage.getItem('oh_passport_evt-1')).toBeNull();
    expect(loadPassportSession('evt-1')?.stampedBoothIds).toEqual(['booth-1']);
  });

  it('migrates a passport session from sessionStorage once', () => {
    sessionStorage.setItem('oh_passport_evt-1', JSON.stringify(sample('evt-1', ['booth-9'])));
    const restored = loadPassportSession('evt-1');
    expect(restored?.stampedBoothIds).toEqual(['booth-9']);
    expect(localStorage.getItem('oh_passport_evt-1')).toBeTruthy();
    expect(sessionStorage.getItem('oh_passport_evt-1')).toBeNull();
    expect(loadPassportSession('evt-1')?.stampedBoothIds).toEqual(['booth-9']);
  });

  it('persists stamps per event and person in localStorage', () => {
    saveStampBoothIds('evt-1', 'p1', ['booth-1', 'booth-2']);
    expect(localStorage.getItem(stampListKey('evt-1', 'p1'))).toBeTruthy();
    expect(loadStampBoothIds('evt-1', 'p1')).toEqual(['booth-1', 'booth-2']);
    expect(loadStampBoothIds('evt-1', 'p2')).toEqual([]);
    expect(loadStampBoothIds('evt-2', 'p1')).toEqual([]);
    clearStampBoothIds('evt-1', 'p1');
    expect(loadStampBoothIds('evt-1', 'p1')).toEqual([]);
  });

  it('falls back to a saved passport session when the stamp list key is empty', () => {
    savePassportSession({ ...sample('evt-1', ['booth-4', 'booth-5']), personId: 'p1' });
    expect(loadStampBoothIds('evt-1', 'p1')).toEqual(['booth-4', 'booth-5']);
  });

  it('stores the anonymous uid with the device check-in', () => {
    saveDeviceCheckin({ eventId: 'evt-1', personId: 'p1', name: 'Juan', anonUid: 'anon-1' });
    expect(loadDeviceCheckin('evt-1')?.anonUid).toBe('anon-1');
  });
});
