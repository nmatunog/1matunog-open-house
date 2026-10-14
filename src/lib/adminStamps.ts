import { uniqueStationIds } from './stations';

/**
 * Published stamp create only allows a guest to write
 * {boothId, anonUid, personId, stampedAt, stampKeyId} under
 * `{theirAnonUid}_{boothId}`, inside the check-in window, with
 * checkin.anonUid == request.auth.uid. An admin Google sign-in cannot
 * satisfy that, and extra fields like source/email are rejected.
 * Admin update on the check-in doc is allowed, so grants live there.
 */
export const ADMIN_STAMP_SOURCE = 'admin' as const;

export function parseAdminBoothIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStationIds(value.map((v) => String(v ?? '')));
}

export type AdminStampGrant = {
  adminBoothIds: string[];
  adminStampBy: string;
  adminStampSource: typeof ADMIN_STAMP_SOURCE;
};

export function adminStampGrantFields(args: {
  grantedBoothIds: string[];
  allowedBoothIds: string[];
  adminEmail: string;
}): AdminStampGrant {
  const allowed = new Set(args.allowedBoothIds);
  return {
    adminBoothIds: uniqueStationIds(args.grantedBoothIds.filter((id) => allowed.has(id))),
    adminStampBy: args.adminEmail.trim().toLowerCase(),
    adminStampSource: ADMIN_STAMP_SOURCE,
  };
}

export function adminStampGrantTouchesStampCollection(payload: object): boolean {
  const keys = Object.keys(payload);
  return keys.includes('stampKeyId') || keys.includes('anonUid') || keys.includes('stampedAt');
}
