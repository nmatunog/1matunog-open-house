import { sha256Hex } from './hash';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  return normalized.length <= 120 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized);
}

export async function personIdFromEmail(email: string): Promise<string> {
  return sha256Hex(normalizeEmail(email));
}

export function isValidName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 1 && trimmed.length <= 80;
}

export function isValidInvitedBy(value: string): boolean {
  return value.trim().length <= 80;
}
