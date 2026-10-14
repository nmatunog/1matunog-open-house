import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { getFirebase } from '../firebase/app';
import { adminStampGrantFields } from '../lib/adminStamps';
import { uniqueStationIds } from '../lib/stations';
import type { Checkin, OhEvent } from '../types';
import { ADMIN_COPY } from './adminCopy';

export function AddStampsForm({
  event,
  checkin,
  scannedBoothIds,
  adminEmail,
  onSaved,
}: {
  event: OhEvent;
  checkin: Checkin;
  scannedBoothIds: string[];
  adminEmail: string;
  onSaved?: () => void;
}) {
  const scanned = uniqueStationIds(scannedBoothIds);
  const [picked, setPicked] = useState<string[]>(() =>
    uniqueStationIds([...(checkin.adminBoothIds ?? []), ...scanned]),
  );
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  function toggle(id: string) {
    if (scanned.includes(id)) return;
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function save(ids: string[]) {
    setBusy(true);
    setNote('');
    try {
      const payload = adminStampGrantFields({
        grantedBoothIds: ids,
        allowedBoothIds: event.booths.map((b) => b.id),
        adminEmail,
      });
      await updateDoc(doc(getFirebase().db, 'oh_events', event.id, 'checkins', checkin.personId), payload);
      setNote(ADMIN_COPY.addStampsSaved);
      onSaved?.();
    } catch {
      setNote('Could not save stamps. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    if (!confirm(ADMIN_COPY.saveStampsConfirm)) return;
    await save(picked);
  }

  async function onMarkAll() {
    if (!confirm(ADMIN_COPY.markAllConfirm)) return;
    const all = event.booths.map((b) => b.id);
    setPicked(all);
    await save(all);
  }

  return (
    <div className="space-y-3 rounded-2xl bg-rose-50 p-4">
      <p className="text-sm font-semibold">{ADMIN_COPY.addStamps}</p>
      <p className="text-sm text-gray-700">{ADMIN_COPY.addStampsHelp}</p>
      <ul className="space-y-2">
        {event.booths.map((b, i) => {
          const fromScan = scanned.includes(b.id);
          const on = picked.includes(b.id);
          return (
            <li key={b.id}>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={on} disabled={fromScan || busy} onChange={() => toggle(b.id)} />
                <span>
                  Station {i + 1} · {b.name}
                  {fromScan ? ' (already scanned)' : ''}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-gray-300"
          disabled={busy}
          onClick={() => void onMarkAll()}
        >
          {ADMIN_COPY.markAllStations}
        </button>
        <button
          type="button"
          className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white disabled:bg-gray-300"
          disabled={busy}
          onClick={() => void onSave()}
        >
          {busy ? 'Saving…' : ADMIN_COPY.saveStamps}
        </button>
      </div>
      {note ? <p className="text-sm text-green-800">{note}</p> : null}
    </div>
  );
}
