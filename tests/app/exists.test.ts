import { describe, expect, it } from 'vitest';
import { snapExists } from '../../src/lib/exists';

describe('snap.exists() is used as a method', () => {
  it('treats exists() as the SDK v9+ method', () => {
    expect(snapExists({ exists: () => true })).toBe(true);
    expect(snapExists({ exists: () => false })).toBe(false);
  });

  it('does not treat a missing method as always-true (the old bug)', () => {
    expect(snapExists({ exists: false })).toBe(false);
  });
});
