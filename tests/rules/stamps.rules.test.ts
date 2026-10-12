import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { stampKeyId } from '../../src/lib/stations';
import {
  adminAuth,
  makeEnv,
  seedOhAdmin,
  seedOpenEvent,
  type RulesTestEnvironment,
} from './helpers';

let env: RulesTestEnvironment;

const TOKEN_E = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TOKEN_F = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

beforeAll(async () => {
  env = await makeEnv();
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seedOhAdmin(env, 'nilo@example.com', 'admin');
  await seedOpenEvent(env, 'E');
  await seedOpenEvent(env, 'F');
  const keyE = await stampKeyId('E', TOKEN_E);
  const keyF = await stampKeyId('F', TOKEN_F);
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'oh_events', 'E', 'stampKeys', keyE), { boothId: 'booth-1', eventId: 'E' });
    await setDoc(doc(db, 'oh_events', 'F', 'stampKeys', keyF), { boothId: 'booth-1', eventId: 'F' });
    await setDoc(doc(db, 'oh_events', 'E', 'stationSecrets', 'booth-1'), {
      token: TOKEN_E,
      shortCode: 'ABC123',
    });
  });
});

const validCheckin = (uid: string) => ({
  name: 'Juan Dela Cruz',
  email: 'juan@example.com',
  phone: '+639171234567',
  invitedBy: 'Ana',
  stampsCompleted: 0,
  checkedInAt: serverTimestamp(),
  anonUid: uid,
  consentVersion: 'placeholder-1',
});

async function validStamp(eventId: string, token: string, uid: string, personId = 'P') {
  const stampKey = await stampKeyId(eventId, token);
  return {
    boothId: 'booth-1',
    anonUid: uid,
    personId,
    stampedAt: serverTimestamp(),
    stampKeyId: stampKey,
  };
}

describe('OH-P1.1 station stamps', () => {
  it('anonymous can stamp with a valid token after check-in', async () => {
    const db = env.authenticatedContext('anon1').firestore();
    await assertSucceeds(setDoc(doc(db, 'oh_events', 'E', 'checkins', 'P'), validCheckin('anon1')));
    await assertSucceeds(
      setDoc(doc(db, 'oh_events', 'E', 'stamps', 'anon1_booth-1'), await validStamp('E', TOKEN_E, 'anon1')),
    );
  });

  it('wrong token is denied', async () => {
    const db = env.authenticatedContext('anon1').firestore();
    await assertSucceeds(setDoc(doc(db, 'oh_events', 'E', 'checkins', 'P'), validCheckin('anon1')));
    await assertFails(
      setDoc(doc(db, 'oh_events', 'E', 'stamps', 'anon1_booth-1'), await validStamp('E', 'ffffffffffffffffffffffffffffffff', 'anon1')),
    );
  });

  it('a token from another event is denied', async () => {
    const db = env.authenticatedContext('anon1').firestore();
    await assertSucceeds(setDoc(doc(db, 'oh_events', 'E', 'checkins', 'P'), validCheckin('anon1')));
    await assertFails(
      setDoc(doc(db, 'oh_events', 'E', 'stamps', 'anon1_booth-1'), await validStamp('F', TOKEN_F, 'anon1')),
    );
    await assertFails(
      setDoc(doc(db, 'oh_events', 'E', 'stamps', 'anon1_booth-1'), await validStamp('E', TOKEN_F, 'anon1')),
    );
  });

  it('duplicate stamp is denied and is not an error path for the guest get', async () => {
    const db = env.authenticatedContext('anon1').firestore();
    await assertSucceeds(setDoc(doc(db, 'oh_events', 'E', 'checkins', 'P'), validCheckin('anon1')));
    const payload = await validStamp('E', TOKEN_E, 'anon1');
    await assertSucceeds(setDoc(doc(db, 'oh_events', 'E', 'stamps', 'anon1_booth-1'), payload));
    await assertFails(setDoc(doc(db, 'oh_events', 'E', 'stamps', 'anon1_booth-1'), await validStamp('E', TOKEN_E, 'anon1')));
    await assertSucceeds(getDoc(doc(db, 'oh_events', 'E', 'stamps', 'anon1_booth-1')));
  });

  it('closed event cannot be stamped', async () => {
    await seedOpenEvent(env, 'E', { status: 'closed' });
    const db = env.authenticatedContext('anon1').firestore();
    await assertFails(setDoc(doc(db, 'oh_events', 'E', 'checkins', 'P'), validCheckin('anon1')));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'oh_events', 'E', 'checkins', 'P'), validCheckin('anon1'));
    });
    await assertFails(
      setDoc(doc(db, 'oh_events', 'E', 'stamps', 'anon1_booth-1'), await validStamp('E', TOKEN_E, 'anon1')),
    );
  });

  it('guests can get a stampKey by id but cannot list tokens or stampKeys', async () => {
    const keyE = await stampKeyId('E', TOKEN_E);
    const db = env.authenticatedContext('anon1').firestore();
    await assertSucceeds(getDoc(doc(db, 'oh_events', 'E', 'stampKeys', keyE)));
    await assertFails(getDocs(collection(db, 'oh_events', 'E', 'stampKeys')));
    await assertFails(getDoc(doc(db, 'oh_events', 'E', 'stationSecrets', 'booth-1')));
    await assertFails(getDocs(collection(db, 'oh_events', 'E', 'stationSecrets')));
    await assertFails(getDocs(collection(db, 'oh_events', 'E', 'stamps')));
  });

  it('admin can read station secrets and list stamp counts', async () => {
    const db = env.authenticatedContext('nilo', adminAuth()).firestore();
    await assertSucceeds(getDoc(doc(db, 'oh_events', 'E', 'stationSecrets', 'booth-1')));
    await assertSucceeds(getDocs(collection(db, 'oh_events', 'E', 'stampKeys')));
    await assertSucceeds(getDocs(collection(db, 'oh_events', 'E', 'stamps')));
  });
});
