import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { emptyTypingProfile, practiceCoaching } from './result-coaching.ts';

describe('Practice coaching', () => {
  it('prioritizes control when accuracy is below the competitive gate', () => {
    const insights = practiceCoaching({
      passage: 'Clean speed wins.',
      input: 'Clxan speed wins.',
      metrics: { correctChars: 15, incorrectChars: 1, grossWpm: 48, netWpm: 39, accuracy: 89, performanceScore: 34 },
      profile: emptyTypingProfile(),
    });
    assert.equal(insights[0]?.label, 'ACCURACY');
    assert.match(insights[0]?.title ?? '', /control/i);
  });

  it('recognizes a repeated first-attempt substitution', () => {
    const profile = emptyTypingProfile();
    profile.firstTryErrors = 2;
    profile.mistakes = [
      { expected: 'i', actual: 'o', index: 2 },
      { expected: 'i', actual: 'o', index: 8 },
    ];
    const insights = practiceCoaching({
      passage: 'typing is timing',
      input: 'typing is timing',
      metrics: { correctChars: 16, incorrectChars: 0, grossWpm: 42, netWpm: 42, accuracy: 100, performanceScore: 42 },
      profile,
    });
    assert.equal(insights[1]?.label, 'PATTERN');
    assert.match(insights[1]?.body ?? '', /2 times/);
  });

  it('turns a long pause into a passage-specific rhythm tip', () => {
    const profile = emptyTypingProfile();
    profile.longestPauseMs = 1_650;
    profile.longestPauseIndex = 10;
    const insights = practiceCoaching({
      passage: 'A steady rhythm makes every transition easier.',
      input: 'A steady rhythm',
      metrics: { correctChars: 15, incorrectChars: 0, grossWpm: 36, netWpm: 36, accuracy: 100, performanceScore: 36 },
      profile,
    });
    assert.equal(insights.at(-1)?.label, 'RHYTHM');
    assert.match(insights.at(-1)?.title ?? '', /1\.7 seconds/);
  });
});
