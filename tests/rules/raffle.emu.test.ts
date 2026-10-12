import { assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { drawAndLock, resolvePendingDraw } from '../../src/lib/raffle';
import { adminAuth, makeEnv, seedOhAdmin, seedOpenEvent, type RulesTestEnvironment } from './helpers';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await makeEnv();
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seedOhAdmin(env, 'nilo@example.com', 'admin');
  await seedOhAdmin(env, 'other@example.com', 'admin');
  await seedOpenEvent(env, 'E');
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const id of ['p1', 'p2', 'p3']) {
      await setDoc(doc(db, 'oh_events', 'E', 'checkins', id), {
        name: `Person ${id}`,
        email: `${id}@example.com`,
        phone: `+63917123456${id.slice(-1)}`,
        invitedBy: 'Ana',
        stampsCompleted: 0,
        checkedInAt: serverTimestamp(),
        anonUid: id,
        consentVersion: 'placeholder-1',
      });
      for (let i = 1; i <= 6; i += 1) {
        await setDoc(doc(db, 'oh_events', 'E', 'stamps', `${id}_booth-${i}`), {
          boothId: `booth-${i}`,
          anonUid: id,
          personId: id,
          stampedAt: serverTimestamp(),
          stampKeyId: 'a'.repeat(64),
        });
      }
    }
  });
});

describe('raffle integrity on emulator', () => {
  it('two concurrent draws yield exactly one pending winner', async () => {
    const a = env.authenticatedContext('nilo', adminAuth()).firestore();
    const b = env.authenticatedContext('other', adminAuth('other@example.com')).firestore();
    const [ra, rb] = await Promise.allSettled([
      drawAndLock(a, 'E', 'nilo@example.com'),
      drawAndLock(b, 'E', 'other@example.com'),
    ]);
    const oks = [ra, rb].filter((r) => r.status === 'fulfilled' && r.value.ok);
    const pendingBlocks = [ra, rb].filter(
      (r) => r.status === 'fulfilled' && !r.value.ok && r.value.reason === 'pending',
    );
    expect(oks.length + pendingBlocks.length).toBeGreaterThanOrEqual(1);
    expect(oks.length).toBe(1);
    const draws = await getDocs(collection(a, 'oh_events', 'E', 'draws'));
    const pending = draws.docs.filter((d) => d.data().status === 'pending');
    expect(pending).toHaveLength(1);
  });

  it('Not here → draw again logs a no-show and picks someone else', async () => {
    const db = env.authenticatedContext('nilo', adminAuth()).firestore();
    const first = await drawAndLock(db, 'E', 'nilo@example.com');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const resolved = await resolvePendingDraw(db, 'E', 'no_show');
    expect(resolved?.personId).toBe(first.personId);
    const second = await drawAndLock(db, 'E', 'nilo@example.com');
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.personId).not.toBe(first.personId);
    const draws = await getDocs(collection(db, 'oh_events', 'E', 'draws'));
    const statuses = draws.docs.map((d) => d.data().status).sort();
    expect(statuses).toContain('no_show');
    expect(statuses).toContain('pending');
    await assertSucceeds(getDocs(collection(db, 'oh_events', 'E', 'draws')));
  });
});
