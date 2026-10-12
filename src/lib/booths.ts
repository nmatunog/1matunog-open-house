import { hashBoothCode, normalizeBoothCode } from './hash';

export const DEFAULT_BOOTH_NAMES = [
  'Products Solutions',
  'AIA Vitality',
  'Internship Program',
  'Corporate Solutions',
  'Medicard',
  'AIA Value Props',
] as const;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomBoothCode(length = 6): string {
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export type BoothDraft = {
  id: string;
  name: string;
  code: string;
};

export function defaultBoothDrafts(): BoothDraft[] {
  return DEFAULT_BOOTH_NAMES.map((name, i) => ({
    id: `booth-${i + 1}`,
    name,
    code: randomBoothCode(),
  }));
}

export function boothsFromLastEvent(
  last: { id: string; name: string }[],
): BoothDraft[] {
  if (last.length === 0) return defaultBoothDrafts();
  return last.map((b, i) => ({
    id: b.id || `booth-${i + 1}`,
    name: b.name,
    code: randomBoothCode(),
  }));
}

export async function boothsToStored(drafts: BoothDraft[]): Promise<
  { id: string; name: string; codeHash: string }[]
> {
  return Promise.all(
    drafts.map(async (b) => ({
      id: b.id,
      name: b.name.trim(),
      codeHash: await hashBoothCode(b.code),
    })),
  );
}

export async function codeMatchesHash(code: string, codeHash: string): Promise<boolean> {
  if (!normalizeBoothCode(code)) return false;
  const hashed = await hashBoothCode(code);
  return hashed === codeHash;
}
