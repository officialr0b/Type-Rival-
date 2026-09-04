import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { journeyAround, progressionForXp, utcMissionPeriod } from './progression.ts';

describe('career progression', () => {
  it('places XP at the correct named checkpoint', () => {
    assert.deepEqual(pick(progressionForXp(0), ['level', 'name', 'percent']), { level: 1, name: 'Rookie', percent: 0 });
    assert.deepEqual(pick(progressionForXp(249), ['level', 'name', 'xpIntoLevel']), { level: 2, name: 'Starter', xpIntoLevel: 149 });
    assert.deepEqual(pick(progressionForXp(1_750), ['level', 'name', 'xpIntoLevel']), { level: 8, name: 'Precision', xpIntoLevel: 0 });
  });

  it('caps the final level cleanly', () => {
    assert.deepEqual(pick(progressionForXp(9_999), ['level', 'name', 'nextLevel', 'percent']), { level: 10, name: 'Elite Rival', nextLevel: null, percent: 100 });
  });

  it('keeps five named journey steps around the player', () => {
    assert.deepEqual(journeyAround(1).map((level) => level.name), ['Rookie', 'Starter', 'Builder', 'Strider', 'Challenger']);
    assert.deepEqual(journeyAround(10).map((level) => level.name), ['Contender', 'Pace Setter', 'Precision', 'Front Runner', 'Elite Rival']);
  });

  it('uses UTC day and Monday boundaries for missions', () => {
    const now = new Date('2026-09-04T23:30:00-04:00');
    assert.deepEqual(pick(utcMissionPeriod(now, 'daily'), ['periodStart', 'resetAt']), { periodStart: '2026-09-05', resetAt: '2026-09-06T00:00:00.000Z' });
    assert.deepEqual(pick(utcMissionPeriod(now, 'weekly'), ['periodStart', 'resetAt']), { periodStart: '2026-08-31', resetAt: '2026-09-07T00:00:00.000Z' });
  });
});

function pick<T extends Record<string, unknown>, K extends keyof T>(value: T, keys: K[]): Pick<T, K> {
  return Object.fromEntries(keys.map((key) => [key, value[key]])) as Pick<T, K>;
}
