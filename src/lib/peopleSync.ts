import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
  type Firestore,
  type WriteBatch,
} from 'firebase/firestore';
import { parseMarketingOptIn, privacyVersionOf } from './consent';
import type { Checkin, DuplicateFlag, Person } from '../types';
import { parseCheckin } from './raffle';

const BATCH_LIMIT = 400;

export async function syncEventCheckins(
  db: Firestore,
  eventId: string,
): Promise<{ synced: number; flags: DuplicateFlag[] }> {
  const checkinSnaps = await getDocs(collection(db, 'oh_events', eventId, 'checkins'));
  const checkins = checkinSnaps.docs.map((d) => parseCheckin(d.id, d.data() as Record<string, unknown>));
  const flags: DuplicateFlag[] = [];
  let synced = 0;

  for (let i = 0; i < checkins.length; i += BATCH_LIMIT) {
    const slice = checkins.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);
    for (const checkin of slice) {
      const result = await planPersonWrite(db, eventId, checkin, batch);
      synced += 1;
      if (result.flag) flags.push(result.flag);
    }
    await batch.commit();
  }
  return { synced, flags };
}

async function planPersonWrite(
  db: Firestore,
  eventId: string,
  checkin: Checkin,
  batch: WriteBatch,
): Promise<{ flag: DuplicateFlag | null }> {
  const personRef = doc(db, 'oh_people', checkin.personId);
  const phoneRef = doc(db, 'oh_phoneIndex', checkin.phone);
  const [personSnap, phoneSnap] = await Promise.all([getDoc(personRef), getDoc(phoneRef)]);

  let flag: DuplicateFlag | null = null;
  if (phoneSnap.exists()) {
    const otherId = String((phoneSnap.data() as { personId?: string }).personId ?? '');
    if (otherId && otherId !== checkin.personId) {
      const other = await getDoc(doc(db, 'oh_people', otherId));
      flag = {
        phone: checkin.phone,
        personId: checkin.personId,
        otherPersonId: otherId,
        email: checkin.email,
        otherEmail: other.exists() ? String((other.data() as { email?: string }).email ?? '') : undefined,
      };
    }
  }

  const marketingOptIn = parseMarketingOptIn(checkin.consentVersion);
  const privacyVersion = privacyVersionOf(checkin.consentVersion);
  const prev = personSnap.exists()
    ? (personSnap.data() as { eventsAttended?: number; eventIds?: string[] })
    : { eventsAttended: 0, eventIds: [] };
  const eventIds = Array.isArray(prev.eventIds) ? prev.eventIds : [];
  const alreadyCounted = eventIds.includes(eventId);
  const nextEventIds = alreadyCounted ? eventIds : [...eventIds, eventId];
  const eventsAttended = alreadyCounted ? Number(prev.eventsAttended ?? 0) : Number(prev.eventsAttended ?? 0) + 1;

  const payload = {
    name: checkin.name,
    email: checkin.email,
    phone: checkin.phone,
    lastSeenAt: serverTimestamp(),
    eventsAttended,
    eventIds: nextEventIds,
    invitedByLast: checkin.invitedBy,
    consent: {
      privacyVersion,
      agreedAt: serverTimestamp(),
      marketingOptIn,
    },
  };

  if (personSnap.exists()) {
    batch.update(personRef, payload);
  } else {
    batch.set(personRef, { ...payload, firstSeenAt: serverTimestamp() });
  }

  if (!phoneSnap.exists()) {
    batch.set(phoneRef, { personId: checkin.personId });
  } else if (!flag) {
    batch.set(phoneRef, { personId: checkin.personId });
  }

  return { flag };
}

export function parsePerson(id: string, data: Record<string, unknown>): Person {
  const consent = data.consent as Person['consent'] | null | undefined;
  return {
    id,
    name: String(data.name ?? ''),
    email: String(data.email ?? ''),
    phone: String(data.phone ?? ''),
    firstSeenAt: data.firstSeenAt as Person['firstSeenAt'],
    lastSeenAt: data.lastSeenAt as Person['lastSeenAt'],
    eventsAttended: Number(data.eventsAttended ?? 0),
    consent: consent ?? null,
    invitedByLast: String(data.invitedByLast ?? ''),
    legacy: data.legacy === true,
  };
}
