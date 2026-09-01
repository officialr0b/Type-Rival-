import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPracticeCoachingReport,
  createCoachingRun,
  emptyTypingProfile,
  practiceCoaching,
  type CoachingRun,
  type MistakeSample,
} from './result-coaching.ts';

const cleanMetrics = {
  correctChars: 180,
  incorrectChars: 0,
  grossWpm: 54,
  netWpm: 54,
  accuracy: 100,
  performanceScore: 54,
};

function historyRun({
  wpm,
  accuracy = 98,
  mistakes = [],
  insightKeys = [],
  index = 0,
}: {
  wpm: number;
  accuracy?: number;
  mistakes?: MistakeSample[];
  insightKeys?: string[];
  index?: number;
}): CoachingRun {
  const profile = emptyTypingProfile();
  profile.firstTryErrors = mistakes.length;
  profile.mistakes = mistakes;
  return createCoachingRun({
    id: `session-${index}`,
    passageId: 'test-passage',
    createdAt: new Date(Date.UTC(2026, 7, 30, 12, index)).toISOString(),
    totalTypedChars: 180,
    metrics: { ...cleanMetrics, grossWpm: wpm, netWpm: wpm, accuracy, performanceScore: wpm * accuracy / 100 },
    profile,
    insightKeys,
  });
}

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
    assert.equal(insights[0]?.label, 'PATTERN');
    assert.match(insights[0]?.body ?? '', /2 times/);
  });

  it('turns a long pause into a passage-specific rhythm tip', () => {
    const profile = emptyTypingProfile();
    profile.longestPauseMs = 1_650;
    profile.longestPauseIndex = 10;
    const report = buildPracticeCoachingReport({
      passage: 'A steady rhythm makes every transition easier.',
      input: 'A steady rhythm',
      metrics: { correctChars: 15, incorrectChars: 0, grossWpm: 36, netWpm: 36, accuracy: 100, performanceScore: 36 },
      profile,
    });
    assert.ok(report.insights.some((insight) => /1\.7 seconds/.test(insight.title)));
    assert.equal(report.drill.title, 'Hesitation reset');
  });

  it('finds a recurring substitution across separate sessions', () => {
    const profile = emptyTypingProfile();
    profile.firstTryErrors = 1;
    profile.mistakes = [{ expected: 't', actual: 'r', index: 0 }];
    const history = [
      historyRun({ wpm: 49, mistakes: [{ expected: 't', actual: 'r', index: 4 }], index: 1 }),
      historyRun({ wpm: 50, mistakes: [{ expected: 't', actual: 'r', index: 12 }], index: 2 }),
    ];
    const report = buildPracticeCoachingReport({
      passage: 'The train turns toward the tall tower.',
      input: 'The train turns toward the tall tower.',
      metrics: cleanMetrics,
      profile,
      history,
    });
    const pattern = report.insights.find((insight) => insight.key.startsWith('pattern:'));
    assert.match(pattern?.body ?? '', /3 recent sessions/);
    assert.match(report.drill.focus, /“t”/);
  });

  it('compares the current run with a five-run baseline', () => {
    const history = [50, 51, 49, 50, 50].map((wpm, index) => historyRun({ wpm, index }));
    const report = buildPracticeCoachingReport({
      passage: 'A steady rhythm makes every transition easier.',
      input: 'A steady rhythm makes every transition easier.',
      metrics: { ...cleanMetrics, grossWpm: 56, netWpm: 56, accuracy: 98, performanceScore: 54.9 },
      profile: emptyTypingProfile(),
      history,
    });
    assert.equal(report.trend.baselineWpm, 50);
    assert.equal(report.trend.wpmDelta, 6);
    assert.match(report.summary, /Fastest coached Practice run/);
    assert.equal(report.insights[0]?.key, 'trend:personal-best');
  });

  it('rotates away from advice shown in recent sessions', () => {
    const report = buildPracticeCoachingReport({
      passage: 'Clean speed grows from steady practice every day.',
      input: 'Clean speed grows from steady practice every day.',
      metrics: cleanMetrics,
      profile: emptyTypingProfile(),
      recentInsightKeys: ['speed:controlled-increase', 'pattern:zero-first-try-errors'],
    });
    assert.ok(!report.insightKeys.includes('speed:controlled-increase'));
    assert.ok(!report.insightKeys.includes('pattern:zero-first-try-errors'));
    assert.equal(report.insights.length, 3);
  });

  it('turns clean accuracy into a specific next-run target', () => {
    const report = buildPracticeCoachingReport({
      passage: 'Clean speed grows from steady practice.',
      input: 'Clean speed grows from steady practice.',
      metrics: cleanMetrics,
      profile: emptyTypingProfile(),
    });
    assert.equal(report.target.wpm, 56);
    assert.equal(report.target.accuracy, 97);
    assert.ok(report.drill.text.length >= 70);
  });
});
