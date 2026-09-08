import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  EMPTY_JUNIOR_PROFILE,
  awardJuniorPracticeRun,
  juniorProgression,
  parseJuniorLocalProfile,
} from './junior-profile.ts';

describe('Private junior profiles', () => {
  it('sanitizes device storage before using it', () => {
    assert.deepEqual(parseJuniorLocalProfile(null), EMPTY_JUNIOR_PROFILE);
    assert.deepEqual(parseJuniorLocalProfile({ totalXp: 145.8, totalRuns: 4.9 }), {
      totalXp: 145,
      totalRuns: 4,
    });
    assert.deepEqual(parseJuniorLocalProfile({ totalXp: -20, totalRuns: 'bad' }), EMPTY_JUNIOR_PROFILE);
  });

  it('adds local practice XP without any backend identity', () => {
    assert.deepEqual(awardJuniorPracticeRun({ totalXp: 80, totalRuns: 3 }, 20), {
      totalXp: 100,
      totalRuns: 4,
    });
  });

  it('uses the named level journey for device-only progress', () => {
    const progression = juniorProgression(275);
    assert.equal(progression.level.name, 'Builder');
    assert.equal(progression.totalXp, 275);
    assert.deepEqual(progression.missions, []);
  });
});
