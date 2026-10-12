import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { Timestamp, serverTimestamp, type Firestore } from 'firebase/firestore';

export const PROJECT_ID = 'cma-dashboard-01';

export async function makeEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync(resolve('firestore.rules'), 'utf8'),
    },
  });
}

export function adminAuth(email = 'nilo@example.com') {
  return { email, email_verified: true };
}

export function viewerAuth(email = 'viewer@example.com') {
  return { email, email_verified: true };
}

export async function seedOhAdmin(
  env: RulesTestEnvironment,
  email: string,
  role: 'admin' | 'viewer',
  extra: Record<string, unknown> = {},
) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'oh_admins', email.toLowerCase()), {
      role,
      active: extra.active ?? true,
      addedBy: 'seed',
      addedAt: Timestamp.now(),
      ...extra,
    });
  });
}

export async function seedOpenEvent(
  env: RulesTestEnvironment,
  eventId = 'evt-open',
  overrides: Record<string, unknown> = {},
) {
  const now = Date.now();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'oh_events', eventId), {
      name: 'Open House',
      venue: 'Cebu',
      eventDate: '2099-01-01',
      checkInOpensAt: Timestamp.fromMillis(now - 3_600_000),
      checkInClosesAt: Timestamp.fromMillis(now + 3_600_000),
      raffle: {
        opensAt: Timestamp.fromMillis(now - 3_600_000),
        closesAt: Timestamp.fromMillis(now + 3_600_000),
        minStamps: 6,
        allowRepeatWinners: false,
        prizes: [],
      },
      booths: [{ id: 'booth-1', name: 'Products', codeHash: 'abc' }],
      status: 'open',
      createdBy: 'nilo@example.com',
      pendingDrawNo: null,
      lastDrawNo: 0,
      ...overrides,
    });
  });
}

export { serverTimestamp, Timestamp };
export type { Firestore, RulesTestEnvironment };
