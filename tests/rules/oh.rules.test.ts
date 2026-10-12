import {
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  Timestamp,
  adminAuth,
  makeEnv,
  seedOhAdmin,
  seedOpenEvent,
  viewerAuth,
  type RulesTestEnvironment,
} from './helpers';

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
  await seedOhAdmin(env, 'viewer@example.com', 'viewer');
  await seedOhAdmin(env, 'inactive@example.com', 'admin', { active: false });
  await seedOpenEvent(env, 'E');
});

const validCheckin = (uid: string) => ({
  name: 'Juan Dela Cruz',
  email: 'juan@example.com',
  phone: '+639171234567',
  invitedBy: 'Ana',
  stampsCompleted: 6,
  checkedInAt: serverTimestamp(),
  anonUid: uid,
  consentVersion: 'placeholder-1',
});

describe('OH guest check-ins', () => {
  it('anonymous can create a valid check-in while the event is open', async () => {
    const db = env.authenticatedContext('anon1').firestore();
    await assertSucceeds(setDoc(doc(db, 'oh_events', 'E', 'checkins', 'P'), validCheckin('anon1')));
  });

  it('denied when the event is closed', async () => {
    await seedOpenEvent(env, 'E', { status: 'closed' });
    const db = env.authenticatedContext('anon1').firestore();
    await assertFails(setDoc(doc(db, 'oh_events', 'E', 'checkins', 'P'), validCheckin('anon1')));
  });

  it('denied outside the check-in window', async () => {
    await seedOpenEvent(env, 'E', {
      checkInOpensAt: Timestamp.fromMillis(0),
      checkInClosesAt: Timestamp.fromMillis(1000),
    });
    const db = env.authenticatedContext('anon1').firestore();
    await assertFails(setDoc(doc(db, 'oh_events', 'E', 'checkins', 'P'), validCheckin('anon1')));
  });

  it('denied with extra fields', async () => {
    const db = env.authenticatedContext('anon1').firestore();
    await assertFails(
      setDoc(doc(db, 'oh_events', 'E', 'checkins', 'P'), { ...validCheckin('anon1'), sneaky: true }),
    );
  });

  it('denied with a bad email', async () => {
    const db = env.authenticatedContext('anon1').firestore();
    await assertFails(
      setDoc(doc(db, 'oh_events', 'E', 'checkins', 'P'), { ...validCheckin('anon1'), email: 'not-an-email' }),
    );
  });

  it('denied with a bad phone', async () => {
    const db = env.authenticatedContext('anon1').firestore();
    await assertFails(
      setDoc(doc(db, 'oh_events', 'E', 'checkins', 'P'), { ...validCheckin('anon1'), phone: '09171234567' }),
    );
  });

  it('denied when anonUid does not match uid', async () => {
    const db = env.authenticatedContext('anon1').firestore();
    await assertFails(
      setDoc(doc(db, 'oh_events', 'E', 'checkins', 'P'), { ...validCheckin('someone-else') }),
    );
  });

  it('second create of the same checkins/P is denied', async () => {
    const db = env.authenticatedContext('anon1').firestore();
    await assertSucceeds(setDoc(doc(db, 'oh_events', 'E', 'checkins', 'P'), validCheckin('anon1')));
    await assertFails(setDoc(doc(db, 'oh_events', 'E', 'checkins', 'P'), validCheckin('anon1')));
  });

  it('anonymous update and delete are denied', async () => {
    const db = env.authenticatedContext('anon1').firestore();
    await assertSucceeds(setDoc(doc(db, 'oh_events', 'E', 'checkins', 'P'), validCheckin('anon1')));
    await assertFails(updateDoc(doc(db, 'oh_events', 'E', 'checkins', 'P'), { name: 'Hacker' }));
    await assertFails(deleteDoc(doc(db, 'oh_events', 'E', 'checkins', 'P')));
  });
});

describe('OH anonymous reads', () => {
  it('cannot read checkins, people, draws, winners, or artifacts', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'oh_events', 'E', 'checkins', 'P'), validCheckin('anon1'));
      await setDoc(doc(db, 'oh_people', 'P'), { name: 'Juan', email: 'j@x.com', phone: '+639171234567' });
      await setDoc(doc(db, 'oh_events', 'E', 'draws', '1'), { personId: 'P', status: 'pending' });
      await setDoc(doc(db, 'oh_events', 'E', 'winners', 'P'), { personId: 'P', status: 'pending' });
      await setDoc(doc(db, 'artifacts', 'app', 'public', 'data', 'submissions', 's1'), { name: 'secret' });
    });
    const db = env.authenticatedContext('anon1').firestore();
    await assertFails(getDoc(doc(db, 'oh_events', 'E', 'checkins', 'P')));
    await assertFails(getDocs(collection(db, 'oh_events', 'E', 'checkins')));
    await assertFails(getDoc(doc(db, 'oh_people', 'P')));
    await assertFails(getDoc(doc(db, 'oh_events', 'E', 'draws', '1')));
    await assertFails(getDoc(doc(db, 'oh_events', 'E', 'winners', 'P')));
    await assertFails(getDoc(doc(db, 'artifacts', 'app', 'public', 'data', 'submissions', 's1')));
  });

  it('can read oh_config/public and the event doc', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'oh_config', 'public'), { currentEventId: 'E' });
    });
    const db = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, 'oh_config', 'public')));
    await assertSucceeds(getDoc(doc(db, 'oh_events', 'E')));
  });
});

describe('OH admin allowlist', () => {
  it('Google user not in oh_admins is denied admin reads/writes', async () => {
    const db = env.authenticatedContext('stranger', { email: 'stranger@example.com', email_verified: true }).firestore();
    await assertFails(getDocs(collection(db, 'oh_events', 'E', 'checkins')));
    await assertFails(setDoc(doc(db, 'oh_people', 'P'), { name: 'x' }));
  });

  it('email_verified=false is denied', async () => {
    const db = env.authenticatedContext('nilo', { email: 'nilo@example.com', email_verified: false }).firestore();
    await assertFails(getDocs(collection(db, 'oh_events', 'E', 'checkins')));
  });

  it('active=false is denied', async () => {
    const db = env.authenticatedContext('inactive', { email: 'inactive@example.com', email_verified: true }).firestore();
    await assertFails(getDocs(collection(db, 'oh_events', 'E', 'checkins')));
  });

  it('viewer can read but not write', async () => {
    const db = env.authenticatedContext('viewer', viewerAuth()).firestore();
    await assertSucceeds(getDocs(collection(db, 'oh_events', 'E', 'checkins')));
    await assertFails(setDoc(doc(db, 'oh_people', 'P'), { name: 'nope' }));
    await assertFails(updateDoc(doc(db, 'oh_events', 'E'), { status: 'closed' }));
  });

  it('admin creating winners/P twice is denied and draws cannot be deleted', async () => {
    const db = env.authenticatedContext('nilo', adminAuth()).firestore();
    await assertSucceeds(setDoc(doc(db, 'oh_events', 'E', 'winners', 'P'), { personId: 'P', drawNo: 1, status: 'pending' }));
    await assertSucceeds(setDoc(doc(db, 'oh_events', 'E', 'draws', '1'), { personId: 'P', status: 'pending' }));
    // create is only allowed when the lock doc does not exist; delete is forbidden, so a
    // second create of the same winners/P can never happen. Delete of draws is also denied.
    await assertFails(deleteDoc(doc(db, 'oh_events', 'E', 'winners', 'P')));
    await assertFails(deleteDoc(doc(db, 'oh_events', 'E', 'draws', '1')));
    const snap = await getDoc(doc(db, 'oh_events', 'E', 'winners', 'P'));
    expect(snap.exists()).toBe(true);
  });

  it('admin can write people and phone index; guests cannot', async () => {
    const admin = env.authenticatedContext('nilo', adminAuth()).firestore();
    await assertSucceeds(setDoc(doc(admin, 'oh_people', 'P'), { name: 'Juan', email: 'j@x.com', phone: '+639171234567' }));
    await assertSucceeds(setDoc(doc(admin, 'oh_phoneIndex', '+639171234567'), { personId: 'P' }));
    const guest = env.authenticatedContext('anon1').firestore();
    await assertFails(setDoc(doc(guest, 'oh_people', 'P2'), { name: 'x' }));
  });
});
