import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  adminAuth,
  makeEnv,
  seedOhAdmin,
  Timestamp,
  type RulesTestEnvironment,
} from './helpers';

const PUBLISHED_RULES = 'tests/rules/fixtures/firestore-rules-publish-2026-10-13.txt';
const ADMIN_EMAIL = 'nmatunog@gmail.com';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await makeEnv({ rulesPath: PUBLISHED_RULES, projectId: 'oh-publish-empty-01' });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seedOhAdmin(env, ADMIN_EMAIL, 'admin');
});

function adminDb() {
  return env.authenticatedContext('nilo-uid', adminAuth(ADMIN_EMAIL)).firestore();
}

describe('published 2026-10-13 rules (empty DB, signed-in admin)', () => {
  it('is the attached live rules: Open House plus Lead Gen and Interview Matrix, no leader-dashboard', () => {
    const rules = readFileSync(resolve(PUBLISHED_RULES), 'utf8');
    expect(rules).toContain("match /oh_config/public");
    expect(rules).toContain("appId == 'aia-lead-capture-2026'");
    expect(rules).toContain('match /users/{userId}/profiles/{profileId}');
    expect(rules).not.toContain('function isLeader()');
    expect(rules).not.toContain('strategic_planning_goals');
  });

  it('lets the admin read their listing, list zero events, and read a missing public event setting', async () => {
    const db = adminDb();
    const me = await assertSucceeds(getDoc(doc(db, 'oh_admins', ADMIN_EMAIL)));
    expect(me.exists()).toBe(true);
    expect(me.data()?.role).toBe('admin');
    expect(me.data()?.active).toBe(true);

    const events = await assertSucceeds(getDocs(collection(db, 'oh_events')));
    expect(events.empty).toBe(true);

    const cfg = await assertSucceeds(getDoc(doc(db, 'oh_config', 'public')));
    expect(cfg.exists()).toBe(false);
  });

  it('lets the admin create the first event and publish it when none exist yet', async () => {
    const db = adminDb();
    const now = Date.now();
    await assertSucceeds(
      setDoc(doc(db, 'oh_events', 'evt-tomorrow'), {
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
        status: 'draft',
        createdBy: ADMIN_EMAIL,
        pendingDrawNo: null,
        lastDrawNo: 0,
      }),
    );
    await assertSucceeds(setDoc(doc(db, 'oh_config', 'public'), { currentEventId: 'evt-tomorrow' }));
    const events = await getDocs(collection(db, 'oh_events'));
    expect(events.size).toBe(1);
    const cfg = await getDoc(doc(db, 'oh_config', 'public'));
    expect(cfg.data()?.currentEventId).toBe('evt-tomorrow');
  });
});
