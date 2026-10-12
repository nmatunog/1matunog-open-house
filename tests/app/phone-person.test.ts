import { describe, expect, it } from 'vitest';
import { projectorName } from '../../src/lib/displayName';
import { personIdFromEmail } from '../../src/lib/person';
import { formatPhoneInput, normalizePhPhone } from '../../src/lib/phone';
import { pickIndex } from '../../src/lib/raffle';

describe('phone, person id, draw pick', () => {
  it('normalizes PH mobiles to +639XXXXXXXXX', () => {
    expect(normalizePhPhone('09171234567')).toBe('+639171234567');
    expect(normalizePhPhone('9171234567')).toBe('+639171234567');
    expect(normalizePhPhone('+63 917 123 4567')).toBe('+639171234567');
    expect(normalizePhPhone('123')).toBeNull();
  });

  it('formats as 09xx while typing', () => {
    expect(formatPhoneInput('09171234567')).toBe('0917 123 4567');
  });

  it('hashes the same email to the same person id', async () => {
    const a = await personIdFromEmail('Juan@Example.com');
    const b = await personIdFromEmail(' juan@example.com ');
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('builds projector names without contact data', () => {
    expect(projectorName('Maria Santos')).toBe('MARIA S.');
    expect(projectorName('Juan Dela Cruz')).toBe('JUAN C.');
  });

  it('picks an index with crypto.getRandomValues', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 40; i += 1) seen.add(pickIndex(5));
    expect([...seen].every((n) => n >= 0 && n < 5)).toBe(true);
    expect(seen.size).toBeGreaterThan(1);
  });
});
