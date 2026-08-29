import type { TypingMetrics } from './game.ts';

export type MistakeSample = {
  expected: string;
  actual: string;
  index: number;
};

export type TypingProfile = {
  corrections: number;
  firstTryErrors: number;
  pauseCount: number;
  longestPauseMs: number;
  longestPauseIndex: number | null;
  mistakes: MistakeSample[];
};

export type CoachingInsight = {
  label: 'ACCURACY' | 'PATTERN' | 'RHYTHM' | 'SPEED';
  title: string;
  body: string;
};

export function emptyTypingProfile(): TypingProfile {
  return {
    corrections: 0,
    firstTryErrors: 0,
    pauseCount: 0,
    longestPauseMs: 0,
    longestPauseIndex: null,
    mistakes: [],
  };
}

export function practiceCoaching({
  passage,
  input,
  metrics,
  profile,
}: {
  passage: string;
  input: string;
  metrics: TypingMetrics;
  profile: TypingProfile;
}): CoachingInsight[] {
  const insights: CoachingInsight[] = [];
  const dominantMistake = mostCommonMistake(profile.mistakes);
  const finalMistakes = finalErrorTypes(passage, input);

  if (metrics.accuracy < 90) {
    insights.push({
      label: 'ACCURACY',
      title: 'Trade a little speed for control.',
      body: `Aim for 90% accuracy before pushing pace. A clean rhythm will raise your net WPM faster than forcing more keystrokes.`,
    });
  } else if (metrics.accuracy < 97) {
    insights.push({
      label: 'ACCURACY',
      title: 'Your next target is 97%.',
      body: `You are close to the clean-speed zone. Repeat this pace and focus on finishing each word before accelerating into the next one.`,
    });
  } else {
    insights.push({
      label: 'SPEED',
      title: 'Accuracy is ready for more speed.',
      body: `You held ${metrics.accuracy.toFixed(1)}% accuracy. On the next run, raise the pace slightly while protecting the same relaxed rhythm.`,
    });
  }

  if (dominantMistake && dominantMistake.count >= 2) {
    insights.push({
      label: 'PATTERN',
      title: `Watch ${characterName(dominantMistake.expected)} versus ${characterName(dominantMistake.actual)}.`,
      body: `That substitution appeared ${dominantMistake.count} times on first attempt. Slow down for that key transition, then build it back up across three clean repetitions.`,
    });
  } else if (finalMistakes.spaces > 0) {
    insights.push({
      label: 'PATTERN',
      title: 'Give the space bar a full beat.',
      body: `At least one remaining error landed on a word boundary. Finish the word, tap space deliberately, then start the next word.`,
    });
  } else if (finalMistakes.punctuation > 0 || finalMistakes.capitals > 0) {
    insights.push({
      label: 'PATTERN',
      title: 'Protect punctuation and Shift keys.',
      body: `The remaining errors included punctuation or capitalization. Read one word ahead so those transitions do not arrive as surprises.`,
    });
  } else if (profile.corrections > 0) {
    insights.push({
      label: 'PATTERN',
      title: `${profile.corrections} correction${profile.corrections === 1 ? '' : 's'} kept the run clean.`,
      body: `Backspace did its job. Now try to recognize the slip one character earlier so the correction costs less time.`,
    });
  }

  if (profile.longestPauseMs >= 900 && profile.longestPauseIndex !== null) {
    const excerpt = passageExcerpt(passage, profile.longestPauseIndex);
    const pauseSeconds = Math.round(profile.longestPauseMs / 100) / 10;
    insights.push({
      label: 'RHYTHM',
      title: `The biggest hesitation was ${pauseSeconds.toFixed(1)} seconds.`,
      body: `It happened near “${excerpt}”. Scan a word ahead and rehearse that transition once before your next full run.`,
    });
  } else {
    const speedGap = Math.max(0, metrics.grossWpm - metrics.netWpm);
    insights.push({
      label: 'RHYTHM',
      title: speedGap >= 8 ? 'Close the gross-to-net gap.' : 'Keep the keystrokes even.',
      body: speedGap >= 8
        ? `Your hands produced speed, but errors pulled net WPM down by ${Math.round(speedGap)}. Use a steadier cadence until the two numbers move closer together.`
        : `Your gross and net speed stayed close. Preserve that consistency by keeping every word at roughly the same cadence.`,
    });
  }

  return insights.slice(0, 3);
}

function mostCommonMistake(mistakes: MistakeSample[]) {
  const counts = new Map<string, { expected: string; actual: string; count: number }>();
  for (const mistake of mistakes) {
    const key = `${mistake.expected}\u0000${mistake.actual}`;
    const current = counts.get(key);
    counts.set(key, current
      ? { ...current, count: current.count + 1 }
      : { expected: mistake.expected, actual: mistake.actual, count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count)[0] ?? null;
}

function finalErrorTypes(passage: string, input: string) {
  let spaces = 0;
  let punctuation = 0;
  let capitals = 0;
  for (let index = 0; index < input.length; index += 1) {
    if (input[index] === passage[index]) continue;
    const expected = passage[index] ?? '';
    if (expected === ' ') spaces += 1;
    if (/[^\p{L}\p{N}\s]/u.test(expected)) punctuation += 1;
    if (/[A-Z]/.test(expected) && input[index]?.toLowerCase() === expected.toLowerCase()) capitals += 1;
  }
  return { spaces, punctuation, capitals };
}

function characterName(character: string) {
  if (character === ' ') return 'space';
  if (character === '') return 'the end of a word';
  return `“${character}”`;
}

function passageExcerpt(passage: string, index: number) {
  const start = Math.max(0, index - 12);
  const end = Math.min(passage.length, index + 22);
  return `${start > 0 ? '…' : ''}${passage.slice(start, end).trim()}${end < passage.length ? '…' : ''}`;
}
