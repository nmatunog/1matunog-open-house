import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { makeEnv, type RulesTestEnvironment } from './helpers';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await makeEnv();
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', 'admin1'), { role: 'admin', isActive: true, agencyName: 'Alpha' });
    await setDoc(doc(db, 'users', 'super1'), { role: 'superuser', isActive: true, agencyName: 'Alpha' });
    await setDoc(doc(db, 'users', 'viewer1'), { role: 'admin-viewer', isActive: true, agencyName: 'Alpha' });
    await setDoc(doc(db, 'users', 'leader1'), { role: 'leader', isActive: true, agencyName: 'Alpha' });
    await setDoc(doc(db, 'users', 'inactive'), { role: 'admin', isActive: false, agencyName: 'Alpha' });
    await setDoc(doc(db, 'users', 'member1'), { role: 'agent', isActive: true, agencyName: 'Alpha' });
    await setDoc(doc(db, 'agencies', 'a1'), { name: 'Alpha' });
    await setDoc(doc(db, 'organizational_hierarchy', 'h1'), { name: 'tree' });
    await setDoc(doc(db, 'data', 'd1'), { hello: true });
    await setDoc(doc(db, 'config', 'c1'), { k: 1 });
    await setDoc(doc(db, 'strategic_planning_goals', 'g1'), { userId: 'member1', agencyName: 'Alpha' });
    await setDoc(doc(db, 'strategic_planning_goals', 'g2'), { userId: 'other', agencyName: 'Beta' });
  });
});

describe('leader-dashboard paths (unchanged behavior)', () => {
  it('user can read their own users doc', async () => {
    const db = env.authenticatedContext('member1').firestore();
    await assertSucceeds(getDoc(doc(db, 'users', 'member1')));
  });

  it('user cannot read another users doc unless admin', async () => {
    const db = env.authenticatedContext('member1').firestore();
    await assertFails(getDoc(doc(db, 'users', 'admin1')));
    const admin = env.authenticatedContext('admin1').firestore();
    await assertSucceeds(getDoc(doc(admin, 'users', 'member1')));
  });

  it('admin-viewer can read users but not write data', async () => {
    const db = env.authenticatedContext('viewer1').firestore();
    await assertSucceeds(getDoc(doc(db, 'users', 'member1')));
    await assertFails(setDoc(doc(db, 'data', 'd2'), { x: 1 }));
  });

  it('unauthenticated can still create a users doc (known issue, not changed here)', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertSucceeds(setDoc(doc(db, 'users', 'minted'), { role: 'admin', isActive: true }));
  });

  it('user can create their own users doc', async () => {
    const db = env.authenticatedContext('newbie').firestore();
    await assertSucceeds(setDoc(doc(db, 'users', 'newbie'), { role: 'agent', isActive: true }));
  });

  it('admin cannot create another admin; superuser can', async () => {
    const admin = env.authenticatedContext('admin1').firestore();
    await assertFails(setDoc(doc(admin, 'users', 'another-admin'), { role: 'admin', isActive: true }));
    const superuser = env.authenticatedContext('super1').firestore();
    await assertSucceeds(setDoc(doc(superuser, 'users', 'another-admin'), { role: 'admin', isActive: true }));
  });

  it('agencies and organizational_hierarchy are publicly readable, admin-writable', async () => {
    const pub = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(pub, 'agencies', 'a1')));
    await assertSucceeds(getDoc(doc(pub, 'organizational_hierarchy', 'h1')));
    await assertFails(setDoc(doc(pub, 'agencies', 'a2'), { name: 'Nope' }));
    const admin = env.authenticatedContext('admin1').firestore();
    await assertSucceeds(setDoc(doc(admin, 'agencies', 'a2'), { name: 'Yes' }));
  });

  it('data is readable by active signed-in users with a users doc; writable by admin only', async () => {
    const member = env.authenticatedContext('member1').firestore();
    await assertSucceeds(getDoc(doc(member, 'data', 'd1')));
    await assertFails(setDoc(doc(member, 'data', 'd2'), { x: 1 }));
    const admin = env.authenticatedContext('admin1').firestore();
    await assertSucceeds(setDoc(doc(admin, 'data', 'd2'), { x: 1 }));
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, 'data', 'd1')));
  });

  it('config is admin-only', async () => {
    const member = env.authenticatedContext('member1').firestore();
    await assertFails(getDoc(doc(member, 'config', 'c1')));
    const admin = env.authenticatedContext('admin1').firestore();
    await assertSucceeds(getDoc(doc(admin, 'config', 'c1')));
  });

  it('members can CRUD their own goals; leaders can read their agency', async () => {
    const member = env.authenticatedContext('member1').firestore();
    await assertSucceeds(getDoc(doc(member, 'strategic_planning_goals', 'g1')));
    await assertFails(getDoc(doc(member, 'strategic_planning_goals', 'g2')));
    await assertSucceeds(
      updateDoc(doc(member, 'strategic_planning_goals', 'g1'), { title: 'Mine' }),
    );
    const leader = env.authenticatedContext('leader1').firestore();
    await assertSucceeds(getDoc(doc(leader, 'strategic_planning_goals', 'g1')));
    await assertFails(getDoc(doc(leader, 'strategic_planning_goals', 'g2')));
  });
});
