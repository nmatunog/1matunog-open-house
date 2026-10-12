import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import QRCode from 'qrcode';
import { SafeText } from '../components/SafeText';
import { getFirebase } from '../firebase/app';
import { formatManilaDate } from '../lib/time';
import { ensureStationMaterials, stationQrUrl, type StationSecret } from '../lib/stations';
import type { OhEvent } from '../types';

type Card = {
  stationNo: number;
  name: string;
  shortCode: string;
  qrDataUrl: string;
};

export function PrintStationCards() {
  const { eventId } = useParams<{ eventId: string }>();
  const [event, setEvent] = useState<OhEvent | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    void (async () => {
      try {
        const { db } = getFirebase();
        const snap = await getDoc(doc(db, 'oh_events', eventId));
        if (!snap.exists()) {
          setError('That event was not found.');
          return;
        }
        const data = snap.data() as Omit<OhEvent, 'id'>;
        const loaded: OhEvent = {
          id: snap.id,
          ...data,
          pendingDrawNo: data.pendingDrawNo ?? null,
          lastDrawNo: data.lastDrawNo ?? 0,
        };
        const { secrets } = await ensureStationMaterials(db, loaded);
        const built = await buildCards(loaded, secrets);
        if (cancelled) return;
        setEvent(loaded);
        setCards(built);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load station cards.');
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      <div className="no-print mx-auto max-w-3xl space-y-3 p-4">
        <p className="text-xs uppercase tracking-widest text-gray-500">1Matunog District</p>
        <h1 className="text-2xl font-black">Print station QR cards</h1>
        <p className="text-gray-700">
          Print these pages. Put one card at each booth. Guests scan the big square with their phone camera.
        </p>
        <p className="text-sm text-gray-600">
          In the print dialog, choose A5, or A4 with two pages per sheet. The small letters under the QR are the
          backup code if someone cannot scan.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-2xl bg-brand px-5 py-3 font-bold text-white"
            onClick={() => window.print()}
            disabled={busy || cards.length === 0}
          >
            Print these cards
          </button>
          <Link to="/admin" className="rounded-2xl bg-white px-5 py-3 font-semibold shadow">
            Back to Today
          </Link>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {busy ? <p>Preparing cards…</p> : null}
      </div>
      <div className="station-print-list mx-auto max-w-3xl print:max-w-none">
        {cards.map((card) => (
          <StationPrintCard
            key={card.stationNo}
            stationNo={card.stationNo}
            name={card.name}
            eventLabel={event ? `${event.name} · ${formatManilaDate(event.eventDate)}` : ''}
            shortCode={card.shortCode}
            qrDataUrl={card.qrDataUrl}
          />
        ))}
      </div>
    </div>
  );
}

export function StationPrintCard({
  stationNo,
  name,
  eventLabel,
  shortCode,
  qrDataUrl,
}: {
  stationNo: number;
  name: string;
  eventLabel: string;
  shortCode: string;
  qrDataUrl: string;
}) {
  return (
    <article className="station-card">
      <header className="station-card-brand">
        <p>1Matunog District</p>
        <p className="station-card-sub">Open House Passport</p>
      </header>
      <p className="station-card-num">Station {stationNo}</p>
      <SafeText as="h2" className="station-card-name" value={name} />
      <img className="station-card-qr" src={qrDataUrl} alt="" />
      {eventLabel ? <p className="station-card-event">{eventLabel}</p> : null}
      <p className="station-card-code">Can&apos;t scan? Code {shortCode}</p>
    </article>
  );
}

async function buildCards(event: OhEvent, secrets: StationSecret[]): Promise<Card[]> {
  const origin = window.location.origin;
  const byBooth = new Map(secrets.map((s) => [s.boothId, s]));
  const cards: Card[] = [];
  for (let i = 0; i < event.booths.length; i += 1) {
    const booth = event.booths[i];
    if (!booth) continue;
    const secret = byBooth.get(booth.id);
    if (!secret?.token) continue;
    const url = stationQrUrl(origin, event.id, secret.token);
    const qrDataUrl = await QRCode.toDataURL(url, {
      margin: 1,
      width: 512,
      errorCorrectionLevel: 'M',
      color: { dark: '#111111', light: '#ffffff' },
    });
    cards.push({
      stationNo: i + 1,
      name: booth.name,
      shortCode: secret.shortCode,
      qrDataUrl,
    });
  }
  return cards;
}
