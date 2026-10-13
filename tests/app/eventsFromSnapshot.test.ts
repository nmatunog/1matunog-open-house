import { describe, expect, it } from 'vitest';
import { eventsFromSnapshot, readAdminRole } from '../../src/admin/eventsFromSnapshot';

describe('eventsFromSnapshot', () => {
  it('returns an empty list for an empty database', () => {
    expect(eventsFromSnapshot([])).toEqual([]);
  });

  it('does not throw when eventDate is missing', () => {
    const list = eventsFromSnapshot([
      { id: 'evt-1', data: () => ({ name: 'Open House' }) },
      { id: 'evt-2', data: () => ({ name: 'Later', eventDate: '2099-12-01' }) },
    ]);
    expect(list.map((e) => e.id)).toEqual(['evt-2', 'evt-1']);
    expect(list[0]?.booths).toEqual([]);
  });
});

describe('readAdminRole', () => {
  it('treats admin in any common casing as admin', () => {
    expect(readAdminRole('admin')).toBe('admin');
    expect(readAdminRole('Admin')).toBe('admin');
    expect(readAdminRole(' ADMIN ')).toBe('admin');
  });

  it('treats a missing role as viewer, not as a crash', () => {
    expect(readAdminRole(undefined)).toBe('viewer');
    expect(readAdminRole(null)).toBe('viewer');
    expect(readAdminRole('viewer')).toBe('viewer');
  });
});
