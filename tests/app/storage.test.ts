import { afterEach, describe, expect, it } from 'vitest';
import {
  clearDeviceCheckin,
  clearPassportSession,
  clearPendingStationScan,
  loadDeviceCheckin,
  loadPassportSession,
  loadPendingStationScan,
  saveDeviceCheckin,
  savePassportSession,
  savePendingStationScan,
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
});
