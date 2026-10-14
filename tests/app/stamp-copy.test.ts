import { describe, expect, it } from 'vitest';
import { needsCheckInBeforeStamp, stampConfirmCopy } from '../../src/guest/applyStamp';

describe('guest stamp confirmation copy', () => {
  it('says Station N stamped with progress', () => {
    expect(stampConfirmCopy('stamped', 3, 4, 6)).toEqual({
      title: 'Station 3 stamped!',
      subtitle: '4 of 6',
    });
  });

  it('duplicate scans say Already stamped and do not look like an error', () => {
    expect(stampConfirmCopy('already', 3, 4, 6)).toEqual({
      title: 'Already stamped',
      subtitle: 'Station 3 · 4 of 6',
    });
  });

  it('all-stations code says All stations stamped', () => {
    expect(stampConfirmCopy('all', 0, 6, 6)).toEqual({
      title: 'All stations stamped!',
      subtitle: '6 of 6',
    });
  });

  it('asks for check-in first when this phone has no person yet, then stamps after', () => {
    expect(needsCheckInBeforeStamp({})).toBe(true);
    expect(needsCheckInBeforeStamp({ devicePersonId: 'p1' })).toBe(false);
    expect(needsCheckInBeforeStamp({ savedPersonId: 'p1' })).toBe(false);
    expect(needsCheckInBeforeStamp({ submitted: true })).toBe(false);
  });
});
