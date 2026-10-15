import { describe, expect, it } from 'vitest';

import type { CabinetItem } from '../../db/cabinet.ts';
import { buildSchedule } from '../push.ts';

const item = (id: number, name: string, expiresOn: string | null): CabinetItem => ({
  id,
  name,
  expiresOn,
  sukl: null,
  detail: null,
  atc: null,
  note: null,
  createdAt: '2026-10-15T12:00:00Z',
});

describe('buildSchedule', () => {
  const now = new Date(2026, 9, 15, 12, 0);

  it('schedules a reminder 30 days before and the morning after expiry', () => {
    expect(buildSchedule([item(3, 'HYLAK FORTE', '2027-08-31')], now)).toEqual([
      {
        id: 'item-3-soon',
        at: new Date(2027, 7, 1, 9).getTime(),
        title: 'HYLAK FORTE brzy projde',
        body: 'Použitelné do 08/2027.',
        url: '/item/3',
      },
      {
        id: 'item-3-expired',
        at: new Date(2027, 8, 1, 9).getTime(),
        title: 'HYLAK FORTE je prošlý',
        body: 'Platnost skončila 08/2027. Odneste ho do lékárny.',
        url: '/item/3',
      },
    ]);
  });

  it('skips items without a date and reminders already in the past', () => {
    const schedule = buildSchedule([item(1, 'Náplasti', null), item(2, 'Magnesium', '2026-10-31')], now);
    expect(schedule.map((r) => r.id)).toEqual(['item-2-expired']);
  });
});
