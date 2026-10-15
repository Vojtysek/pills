import { describe, expect, it } from 'vitest';

import { daysUntil, expiryStatus, formatExpiry, parseExpiryInput, reminderDates } from '../expiry.ts';

const now = new Date(2026, 9, 15, 12, 0); // 15 Oct 2026

describe('expiryStatus', () => {
  it('classifies by days left', () => {
    expect(expiryStatus('2026-10-14', now)).toBe('expired');
    expect(expiryStatus('2026-10-15', now)).toBe('soon'); // last valid day is today
    expect(expiryStatus('2026-11-14', now)).toBe('soon');
    expect(expiryStatus('2027-08-31', now)).toBe('ok');
    expect(expiryStatus(null, now)).toBe('unknown');
  });

  it('counts calendar days', () => {
    expect(daysUntil('2026-10-16', now)).toBe(1);
  });
});

describe('formatExpiry', () => {
  it('shows month-only dates the way they are printed on the box', () => {
    expect(formatExpiry('2027-08-31')).toBe('08/2027');
    expect(formatExpiry('2027-03-15')).toBe('15. 3. 2027');
  });
});

describe('parseExpiryInput', () => {
  it.each([
    ['8/2027', '2027-08-31'],
    ['08 27', '2027-08-31'],
    ['15.3.2027', '2027-03-15'],
    ['2/2028', '2028-02-29'],
  ])('%s → %s', (input, expected) => {
    expect(parseExpiryInput(input)).toBe(expected);
  });

  it.each(['', '2027', '13/2027', '31.2.2027'])('rejects %j', (input) => {
    expect(parseExpiryInput(input)).toBeNull();
  });
});

describe('reminderDates', () => {
  it('schedules 30 days before and the morning after expiry', () => {
    const dates = reminderDates('2027-08-31', now);
    expect(dates.map((r) => [r.kind, r.date.toDateString(), r.date.getHours()])).toEqual([
      ['soon', new Date(2027, 7, 1).toDateString(), 9],
      ['expired', new Date(2027, 8, 1).toDateString(), 9],
    ]);
  });

  it('skips reminders in the past', () => {
    expect(reminderDates('2026-10-20', now).map((r) => r.kind)).toEqual(['expired']);
  });
});
