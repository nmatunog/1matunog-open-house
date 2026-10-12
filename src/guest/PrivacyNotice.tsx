import { MoreDetails } from '../components/MoreDetails';

export function PrivacyNotice() {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
      <p className="font-bold uppercase tracking-wide text-xs text-amber-800">
        PLACEHOLDER — pending Nilo
      </p>
      <p className="mt-2">
        We (the data controller <strong>Cebu Matunog Agency / 1Matunog District</strong>) collect your
        name, mobile number, email, and who invited you so we can record attendance at this Open House,
        run the raffle, and — only if you tick the extra box — follow up about AIA offers.
      </p>
      <MoreDetails title="Full Privacy Notice (draft)">
        <p>
          This wording is a clearly marked placeholder until Nilo approves the final notice, retention
          period, and Data Protection Officer contact.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Controller: Cebu Matunog Agency / 1Matunog District</li>
          <li>Purpose: event attendance, raffle, optional marketing follow-up by the inviting agent</li>
          <li>Retention: keep for 2 years, then delete (pending confirmation)</li>
          <li>Your rights (PH Data Privacy Act / RA 10173): access, correction, erasure</li>
          <li>Contact for privacy requests: PLACEHOLDER — pending Nilo</li>
        </ul>
      </MoreDetails>
    </div>
  );
}
