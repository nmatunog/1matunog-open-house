import { afterEach, describe, expect, it } from 'vitest';
import {
  clearPassportSession,
  loadPassportSession,
  savePassportSession,
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
});
