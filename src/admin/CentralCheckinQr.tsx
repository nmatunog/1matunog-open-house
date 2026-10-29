import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

const PUBLIC_URL = 'https://1cmaopenhouse.netlify.app/';

export function CentralCheckinQr({ eventIsPublic, eventName }: { eventIsPublic: boolean; eventName: string }) {
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(PUBLIC_URL, { margin: 2, width: 640, errorCorrectionLevel: 'M' })
      .then((url) => { if (active) setQr(url); })
      .catch(() => { if (active) setError('Could not generate the QR code.'); });
    return () => { active = false; };
  }, []);
  if (!eventIsPublic) return <p className="text-sm text-amber-800">Make this the public event before displaying its check-in QR.</p>;
  return (
    <section className="rounded-2xl bg-white p-4 shadow">
      <h2 className="font-bold">Central event check-in QR</h2>
      <p className="mb-3 text-sm text-gray-600">Guests scan this once to register and check in. Station QR codes remain optional when the scan requirement is suspended.</p>
      <div className="mx-auto max-w-xs text-center">
        <p className="font-semibold">{eventName}</p>
        {qr ? <img className="mx-auto w-full" src={qr} alt="Central event check-in QR code" /> : <p>{error || 'Generating QR…'}</p>}
        <p className="break-all text-xs">{PUBLIC_URL}</p>
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <a className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white" href={PUBLIC_URL} target="_blank" rel="noreferrer">Open check-in</a>
        {qr ? <a className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white" download="1cma-event-checkin-qr.png" href={qr}>Download QR</a> : null}
        <button type="button" className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white" onClick={() => {
          const popup = window.open('', '_blank');
          if (!popup || !qr) return;
          const doc = popup.document;
          doc.title = 'Open House Check-in QR';
          const heading = doc.createElement('h1'); heading.textContent = eventName;
          const label = doc.createElement('p'); label.textContent = 'Scan to register and check in';
          const img = doc.createElement('img'); img.src = qr; img.width = 500; img.alt = 'Check-in QR';
          doc.body.append(heading,label,img);
          img.onload = () => popup.print();
        }}>Print QR</button>
      </div>
    </section>
  );
}
