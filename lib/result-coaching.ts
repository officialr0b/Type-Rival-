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

export type CoachingRun = {
  id?: string;
  passageId: string;
  createdAt: string;
  totalTypedChars: number;
  metrics: TypingMetrics;
  profile: TypingProfile;
  insightKeys: string[];
};

export type CoachingInsight = {
  key: string;
  label: 'ACCURACY' | 'PATTERN' | 'RHYTHM' | 'SPEED' | 'TREND';
  title: string;
  body: string;
  evidence: string;
};

export type CoachingTrend = {
  previousRuns: number;
  baselineWpm: number | null;
  baselineAccuracy: number | null;
  wpmDelta: number | null;
  accuracyDelta: number | null;
  consistencyLabel: 'BUILDING' | 'STEADY' | 'VARIABLE';
  spreadWpm: number | null;
};

export type CoachingTarget = {
  wpm: number;
  accuracy: number;
  rationale: string;
};

export type CoachingDrill = {
  title: string;
  focus: string;
  text: string;
};

export type PracticeCoachingReport = {
  summary: string;
  sessionNumber: number;
  insights: CoachingInsight[];
  insightKeys: string[];
  trend: CoachingTrend;
  target: CoachingTarget;
  drill: CoachingDrill;
};

type PracticeCoachingInput = {
  passage: string;
  input: string;
  metrics: TypingMetrics;
  profile: TypingProfile;
  history?: CoachingRun[];
  recentInsightKeys?: string[];
};

type MistakePattern = {
  expected: string;
  actual: string;
  count: number;
  sessions: number;
  currentCount: number;
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

export function createCoachingRun({
  id,
  passageId,
  createdAt = new Date().toISOString(),
  totalTypedChars,
  metrics,
  profile,
  insightKeys = [],
}: {
  id?: string;
  passageId: string;
  createdAt?: string;
  totalTypedChars: number;
  metrics: TypingMetrics;
  profile: TypingProfile;
  insightKeys?: string[];
}): CoachingRun {
  return {
    id,
    passageId,
    createdAt,
    totalTypedChars: clampInteger(totalTypedChars, 0, 2_000),
    metrics: {
      correctChars: finite(metrics.correctChars),
      incorrectChars: finite(metrics.incorrectChars),
      grossWpm: finite(metrics.grossWpm),
      netWpm: finite(metrics.netWpm),
      accuracy: finite(metrics.accuracy),
      performanceScore: finite(metrics.performanceScore),
    },
    profile: sanitizeProfile(profile),
    insightKeys: insightKeys.filter((key) => /^[a-z0-9:-]{1,80}$/i.test(key)).slice(0, 6),
  };
}

export function buildPracticeCoachingReport({
  passage,
  input,
  metrics,
  profile,
  history = [],
  recentInsightKeys = [],
}: PracticeCoachingInput): PracticeCoachingReport {
  const validHistory = history
    .filter((run) => Number.isFinite(run.metrics.netWpm) && Number.isFinite(run.metrics.accuracy))
    .slice(0, 12);
  const sessionNumber = validHistory.length + 1;
  const baselineRuns = validHistory.slice(0, 5);
  const baselineWpm = average(baselineRuns.map((run) => run.metrics.netWpm));
  const baselineAccuracy = average(baselineRuns.map((run) => run.metrics.accuracy));
  const wpmDelta = baselineWpm === null ? null : round1(metrics.netWpm - baselineWpm);
  const accuracyDelta = baselineAccuracy === null ? null : round1(metrics.accuracy - baselineAccuracy);
  const recentSpeeds = [metrics.netWpm, ...baselineRuns.map((run) => run.metrics.netWpm)];
  const spreadWpm = recentSpeeds.length < 3 ? null : round1(standardDeviation(recentSpeeds));
  const consistencyLabel = spreadWpm === null ? 'BUILDING' : spreadWpm <= 3 ? 'STEADY' : 'VARIABLE';
  const trend: CoachingTrend = {
    previousRuns: validHistory.length,
    baselineWpm: baselineWpm === null ? null : round1(baselineWpm),
    baselineAccuracy: baselineAccuracy === null ? null : round1(baselineAccuracy),
    wpmDelta,
    accuracyDelta,
    consistencyLabel,
    spreadWpm,
  };

  const patterns = aggregateMistakes(profile, validHistory);
  const recurringPattern = patterns.find((pattern) => pattern.sessions >= 2 && pattern.count >= 2)
    ?? patterns.find((pattern) => pattern.currentCount >= 2)
    ?? null;
  const currentPattern = mostCommonMistake(profile.mistakes);
  const finalMistakes = finalErrorTypes(passage, input);
  const speedGap = Math.max(0, metrics.grossWpm - metrics.netWpm);
  const previousBest = validHistory.length === 0
    ? null
    : Math.max(...validHistory.map((run) => run.metrics.netWpm));
  const target = nextTarget(metrics, baselineWpm, baselineAccuracy);
  const candidates: CoachingInsight[] = [];
  const add = (insight: CoachingInsight) => candidates.push(insight);

  if (previousBest !== null && metrics.netWpm >= previousBest + 0.5 && metrics.accuracy >= 90) {
    add({
      key: 'trend:personal-best',
      label: 'TREND',
      title: 'New coached-session best.',
      body: `This run cleared your previous best of ${Math.round(previousBest)} WPM. The next challenge is repeating the speed without giving accuracy back.`,
      evidence: `${Math.round(metrics.netWpm)} WPM · previous best ${Math.round(previousBest)} WPM`,
    });
  }

  if (wpmDelta !== null && wpmDelta >= 2 && (accuracyDelta === null || accuracyDelta >= -1)) {
    add({
      key: 'trend:speed-up',
      label: 'TREND',
      title: 'Your recent pace moved forward.',
      body: `You ran ${formatSigned(wpmDelta)} WPM above your five-run baseline without a meaningful accuracy drop. Treat this as repeatable pace, not a one-run sprint.`,
      evidence: `${Math.round(metrics.netWpm)} WPM · ${formatSigned(wpmDelta)} versus baseline`,
    });
  } else if (accuracyDelta !== null && accuracyDelta >= 1.2) {
    add({
      key: 'trend:accuracy-up',
      label: 'TREND',
      title: 'Control improved against your baseline.',
      body: `Accuracy finished ${formatSigned(accuracyDelta)} points above your recent average. Hold that control while adding only a small amount of speed next run.`,
      evidence: `${metrics.accuracy.toFixed(1)}% · ${formatSigned(accuracyDelta)} points`,
    });
  }

  if (accuracyDelta !== null && accuracyDelta <= -2 && metrics.netWpm > (baselineWpm ?? 0)) {
    add({
      key: 'trend:speed-cost-accuracy',
      label: 'TREND',
      title: 'The added speed cost too much control.',
      body: `Pace rose, but accuracy fell ${Math.abs(accuracyDelta).toFixed(1)} points below your recent baseline. Pull back two WPM and rebuild from a clean run.`,
      evidence: `${formatSigned(wpmDelta ?? 0)} WPM · ${formatSigned(accuracyDelta)} accuracy points`,
    });
  }

  if (recurringPattern) {
    const acrossRuns = recurringPattern.sessions >= 2;
    add({
      key: `pattern:${safeKey(recurringPattern.expected)}:${safeKey(recurringPattern.actual)}`,
      label: 'PATTERN',
      title: `Watch ${characterName(recurringPattern.expected)} versus ${characterName(recurringPattern.actual)}.`,
      body: acrossRuns
        ? `That substitution appeared ${recurringPattern.count} times across ${recurringPattern.sessions} recent sessions. The drill below concentrates on the expected key in real words.`
        : `That substitution appeared ${recurringPattern.currentCount} times in this run. Slow the transition down until you can land it cleanly three times in a row.`,
      evidence: `${recurringPattern.count} first-attempt slips · ${recurringPattern.sessions} session${recurringPattern.sessions === 1 ? '' : 's'}`,
    });
  } else if (finalMistakes.spaces > 0) {
    add({
      key: 'pattern:space-boundary',
      label: 'PATTERN',
      title: 'Word boundaries need a cleaner beat.',
      body: 'A remaining error landed on a space. Finish the word, make the space a deliberate keystroke, and then launch the next word.',
      evidence: `${finalMistakes.spaces} remaining space error${finalMistakes.spaces === 1 ? '' : 's'}`,
    });
  } else if (finalMistakes.punctuation > 0 || finalMistakes.capitals > 0) {
    add({
      key: 'pattern:shift-punctuation',
      label: 'PATTERN',
      title: 'Protect Shift and punctuation transitions.',
      body: 'Read one word ahead so capitalization and punctuation are prepared before they arrive. Do not let the symbol interrupt the sentence rhythm.',
      evidence: `${finalMistakes.punctuation + finalMistakes.capitals} remaining transition error${finalMistakes.punctuation + finalMistakes.capitals === 1 ? '' : 's'}`,
    });
  }

  if (metrics.accuracy < 90) {
    add({
      key: 'accuracy:control-first',
      label: 'ACCURACY',
      title: 'Trade a little speed for control.',
      body: 'Do not chase a higher WPM yet. Bring the next run above 90% by using a steady pace you can sustain from the first word to the last.',
      evidence: `${metrics.accuracy.toFixed(1)}% accuracy · 90% competitive gate`,
    });
    add({
      key: 'accuracy:clean-word-groups',
      label: 'ACCURACY',
      title: 'Build the passage in clean word groups.',
      body: 'Treat every three words as a small unit. Complete the unit cleanly, reset your rhythm, and only then allow the pace to rise.',
      evidence: `${metrics.incorrectChars} uncorrected error${metrics.incorrectChars === 1 ? '' : 's'}`,
    });
  } else if (metrics.accuracy < 97) {
    add({
      key: 'accuracy:clean-speed-zone',
      label: 'ACCURACY',
      title: 'Your next accuracy target is 97%.',
      body: 'The speed is usable. The larger gain now comes from removing a few errors, not forcing more keystrokes into the same 45 seconds.',
      evidence: `${metrics.accuracy.toFixed(1)}% accuracy · ${Math.round(speedGap)} WPM gross-to-net gap`,
    });
    add({
      key: 'accuracy:one-word-ahead',
      label: 'RHYTHM',
      title: 'Move your eyes one word ahead.',
      body: 'Let your eyes prepare the next word while your hands finish the current one. That small preview reduces surprise corrections without slowing the run.',
      evidence: `${profile.firstTryErrors} first-attempt slip${profile.firstTryErrors === 1 ? '' : 's'}`,
    });
  } else {
    add({
      key: 'speed:controlled-increase',
      label: 'SPEED',
      title: 'Accuracy can support a small speed increase.',
      body: `Raise the target to ${target.wpm} WPM while protecting at least ${target.accuracy}% accuracy. A small controlled increase is more useful than an all-out opening burst.`,
      evidence: `${metrics.accuracy.toFixed(1)}% accuracy · next target ${target.wpm} WPM`,
    });
    add({
      key: 'speed:repeatability-test',
      label: 'TREND',
      title: 'Prove the pace is repeatable.',
      body: 'Try to land within three WPM of this score twice while staying above 97% accuracy. Repeatability is what turns a fast run into a new baseline.',
      evidence: `${Math.round(metrics.netWpm)} WPM at ${metrics.accuracy.toFixed(1)}%`,
    });
    add({
      key: 'speed:strong-finish',
      label: 'SPEED',
      title: 'Save the acceleration for the finish.',
      body: 'Open at this run’s comfortable pace, then increase pressure during the final ten seconds. This tests your ceiling without sacrificing the whole result.',
      evidence: `${Math.round(metrics.netWpm)} net WPM · ${Math.round(metrics.grossWpm)} gross WPM`,
    });
  }

  if (profile.corrections > 0) {
    const correctionShare = Math.round((profile.corrections / Math.max(1, profile.firstTryErrors)) * 100);
    add({
      key: correctionShare >= 75 ? 'pattern:fast-recovery' : 'pattern:earlier-recovery',
      label: 'PATTERN',
      title: correctionShare >= 75 ? 'You recovered most visible slips.' : 'Catch slips one character earlier.',
      body: correctionShare >= 75
        ? 'Backspace kept the final result cleaner. Now work on recognizing the mistake sooner so each recovery costs fewer keystrokes.'
        : 'Several first-attempt slips remained or took time to repair. React at the first wrong character instead of finishing the word before correcting.',
      evidence: `${profile.corrections} correction${profile.corrections === 1 ? '' : 's'} · ${profile.firstTryErrors} first-attempt slips`,
    });
  } else if (profile.firstTryErrors === 0) {
    add({
      key: 'pattern:zero-first-try-errors',
      label: 'PATTERN',
      title: 'Every recorded character landed cleanly first.',
      body: 'Use the drill below as a short warm-up, then increase pace gradually until the first error appears. That point marks today’s control ceiling.',
      evidence: '0 first-attempt slips · 0 corrections',
    });
  }

  if (profile.longestPauseMs >= 900 && profile.longestPauseIndex !== null) {
    const excerpt = passageExcerpt(passage, profile.longestPauseIndex);
    const pauseSeconds = Math.round(profile.longestPauseMs / 100) / 10;
    add({
      key: `rhythm:pause:${Math.floor(profile.longestPauseIndex / 12)}`,
      label: 'RHYTHM',
      title: `The biggest hesitation lasted ${pauseSeconds.toFixed(1)} seconds.`,
      body: `It happened near “${excerpt}”. Rehearse that section once, then scan a word ahead when a similar transition appears.`,
      evidence: `${pauseSeconds.toFixed(1)}s pause · ${profile.pauseCount} measured hesitation${profile.pauseCount === 1 ? '' : 's'}`,
    });
  } else if (speedGap >= 8) {
    add({
      key: 'rhythm:gross-net-gap',
      label: 'RHYTHM',
      title: 'Close the gross-to-net gap.',
      body: `Your hands produced speed, but errors removed ${Math.round(speedGap)} WPM from the result. A steadier cadence will recover more score than another burst of raw speed.`,
      evidence: `${Math.round(metrics.grossWpm)} gross · ${Math.round(metrics.netWpm)} net WPM`,
    });
  } else if (spreadWpm !== null && spreadWpm <= 3) {
    add({
      key: 'rhythm:stable-baseline',
      label: 'RHYTHM',
      title: 'Your recent speed is becoming stable.',
      body: `Recent runs sit inside a ${spreadWpm.toFixed(1)} WPM spread. Increase the target in small steps so accuracy can adapt with the pace.`,
      evidence: `${spreadWpm.toFixed(1)} WPM recent spread`,
    });
  } else {
    add({
      key: 'rhythm:even-cadence',
      label: 'RHYTHM',
      title: 'Keep every word on the same cadence.',
      body: 'Gross and net speed stayed close. Preserve that efficiency by resisting the urge to sprint through easy words and stall on longer ones.',
      evidence: `${Math.round(speedGap)} WPM gross-to-net gap`,
    });
  }

  if (validHistory.length === 0) {
    add({
      key: 'trend:first-baseline',
      label: 'TREND',
      title: 'This run starts your coaching baseline.',
      body: 'Complete two more Practice runs and TypeRival can begin separating one-off results from repeatable speed, accuracy, and error patterns.',
      evidence: '1 coached Practice session',
    });
  }

  const insights = selectFreshInsights(candidates, recentInsightKeys, 3);
  const summary = coachingSummary({ metrics, previousBest, wpmDelta, accuracyDelta, historyCount: validHistory.length });

  return {
    summary,
    sessionNumber,
    insights,
    insightKeys: insights.map((insight) => insight.key),
    trend,
    target,
    drill: createDrill(passage, profile, recurringPattern ?? patternFromCurrent(currentPattern)),
  };
}

// Compatibility helper for existing callers and focused unit tests.
export function practiceCoaching(input: Omit<PracticeCoachingInput, 'history' | 'recentInsightKeys'>): CoachingInsight[] {
  return buildPracticeCoachingReport(input).insights;
}

function selectFreshInsights(candidates: CoachingInsight[], recentKeys: string[], limit: number) {
  const seenCandidateKeys = new Set<string>();
  const unique = candidates
    .filter((candidate) => {
      if (seenCandidateKeys.has(candidate.key)) return false;
      seenCandidateKeys.add(candidate.key);
      return true;
    })
    .sort((left, right) => insightPriority(right.key) - insightPriority(left.key));
  const suppressed = new Set(recentKeys.slice(0, 18));
  const fresh = unique.filter((candidate) => !suppressed.has(candidate.key));
  const selected = fresh.slice(0, limit);
  if (selected.length < limit) {
    for (const candidate of unique) {
      if (selected.some((item) => item.key === candidate.key)) continue;
      selected.push(candidate);
      if (selected.length === limit) break;
    }
  }
  return selected;
}

function insightPriority(key: string) {
  if (key === 'trend:personal-best') return 110;
  if (key === 'trend:speed-cost-accuracy') return 108;
  if (key.startsWith('pattern:') && !key.includes('zero-first')) return 104;
  if (key.startsWith('rhythm:pause:')) return 102;
  if (key === 'trend:speed-up' || key === 'trend:accuracy-up') return 100;
  if (key.startsWith('accuracy:')) return 94;
  if (key === 'pattern:zero-first-try-errors') return 90;
  if (key === 'rhythm:gross-net-gap') return 88;
  if (key === 'speed:controlled-increase') return 84;
  if (key === 'trend:first-baseline') return 82;
  if (key === 'rhythm:stable-baseline') return 80;
  if (key === 'speed:repeatability-test') return 76;
  if (key === 'rhythm:even-cadence') return 72;
  return 68;
}

function aggregateMistakes(current: TypingProfile, history: CoachingRun[]): MistakePattern[] {
  const counts = new Map<string, MistakePattern & { sessionIds: Set<number> }>();
  const runs = [{ profile: current }, ...history];
  runs.forEach((run, sessionIndex) => {
    for (const mistake of run.profile.mistakes) {
      const key = `${mistake.expected}\u0000${mistake.actual}`;
      const found = counts.get(key) ?? {
        expected: mistake.expected,
        actual: mistake.actual,
        count: 0,
        sessions: 0,
        currentCount: 0,
        sessionIds: new Set<number>(),
      };
      found.count += 1;
      if (sessionIndex === 0) found.currentCount += 1;
      found.sessionIds.add(sessionIndex);
      found.sessions = found.sessionIds.size;
      counts.set(key, found);
    }
  });
  return [...counts.values()]
    .map((pattern) => ({
      expected: pattern.expected,
      actual: pattern.actual,
      count: pattern.count,
      sessions: pattern.sessions,
      currentCount: pattern.currentCount,
    }))
    .sort((a, b) => b.sessions - a.sessions || b.count - a.count || b.currentCount - a.currentCount);
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

function patternFromCurrent(pattern: { expected: string; actual: string; count: number } | null): MistakePattern | null {
  return pattern ? { ...pattern, sessions: 1, currentCount: pattern.count } : null;
}

function nextTarget(metrics: TypingMetrics, baselineWpm: number | null, baselineAccuracy: number | null): CoachingTarget {
  if (metrics.accuracy >= 97) {
    const wpm = Math.ceil(Math.max(metrics.netWpm + 2, (baselineWpm ?? metrics.netWpm) + 1));
    return {
      wpm,
      accuracy: 97,
      rationale: `Your ${metrics.accuracy.toFixed(1)}% accuracy leaves room for a controlled speed increase.`,
    };
  }
  if (metrics.accuracy >= 90) {
    return {
      wpm: Math.max(1, Math.round(Math.min(metrics.netWpm, baselineWpm ?? metrics.netWpm))),
      accuracy: 97,
      rationale: 'Hold roughly the same pace and convert the remaining errors into clean keystrokes.',
    };
  }
  return {
    wpm: Math.max(1, Math.floor(metrics.netWpm - 2)),
    accuracy: Math.max(90, Math.ceil(baselineAccuracy ?? 90)),
    rationale: 'A small pace reduction gives you enough room to rebuild control above the competitive gate.',
  };
}

function createDrill(passage: string, profile: TypingProfile, pattern: MistakePattern | null): CoachingDrill {
  if (pattern) {
    const expected = pattern.expected;
    const words = passageWords(passage);
    const focused = expected === ' '
      ? words.filter((word) => word.length >= 3 && word.length <= 8)
      : words.filter((word) => word.toLocaleLowerCase().includes(expected.toLocaleLowerCase()));
    const source = focused.length >= 3 ? focused : words;
    return {
      title: expected === ' ' ? 'Word-boundary drill' : `${characterName(expected)} transition drill`,
      focus: expected === ' '
        ? 'Make every space a deliberate beat.'
        : `Land ${characterName(expected)} cleanly without drifting toward ${characterName(pattern.actual)}.`,
      text: buildDrillText(source),
    };
  }

  if (profile.longestPauseMs >= 900 && profile.longestPauseIndex !== null) {
    const excerpt = passageExcerpt(passage, profile.longestPauseIndex, 34);
    return {
      title: 'Hesitation reset',
      focus: 'Read the full phrase once, then type it three times at an even cadence.',
      text: `${capitalize(excerpt.replace(/^…|…$/g, ''))}.`,
    };
  }

  return {
    title: 'Cadence warm-up',
    focus: 'Type this twice without rushing the easy words.',
    text: buildDrillText(passageWords(passage)),
  };
}

function buildDrillText(words: string[]) {
  const usable = words.filter(Boolean);
  if (usable.length === 0) return 'Steady hands build clean speed one word at a time.';
  const chosen: string[] = [];
  let index = 0;
  while (chosen.join(' ').length < 90 && chosen.length < 18) {
    chosen.push(usable[index % usable.length]!);
    index += 1;
  }
  return `${capitalize(chosen.join(' ').replace(/[.,!?;:]+$/u, ''))}.`;
}

function passageWords(passage: string) {
  return passage.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)?/gu) ?? [];
}

function coachingSummary({
  metrics,
  previousBest,
  wpmDelta,
  accuracyDelta,
  historyCount,
}: {
  metrics: TypingMetrics;
  previousBest: number | null;
  wpmDelta: number | null;
  accuracyDelta: number | null;
  historyCount: number;
}) {
  if (historyCount === 0) return 'Baseline established. Two more runs will unlock meaningful trend and recurring-pattern analysis.';
  if (previousBest !== null && metrics.netWpm >= previousBest + 0.5) {
    return `Fastest coached Practice run so far: ${Math.round(metrics.netWpm)} WPM at ${metrics.accuracy.toFixed(1)}% accuracy.`;
  }
  if (wpmDelta !== null && wpmDelta >= 2 && (accuracyDelta ?? 0) >= -1) {
    return `Pace is moving up while accuracy holds: ${formatSigned(wpmDelta)} WPM against your recent baseline.`;
  }
  if (accuracyDelta !== null && accuracyDelta <= -2) {
    return `Speed is available, but control slipped ${Math.abs(accuracyDelta).toFixed(1)} accuracy points below your baseline.`;
  }
  return 'This run sits near your recent level. The next gain comes from the specific target and drill below.';
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

function sanitizeProfile(profile: TypingProfile): TypingProfile {
  return {
    corrections: clampInteger(profile.corrections, 0, 2_000),
    firstTryErrors: clampInteger(profile.firstTryErrors, 0, 2_000),
    pauseCount: clampInteger(profile.pauseCount, 0, 2_000),
    longestPauseMs: clampInteger(profile.longestPauseMs, 0, 120_000),
    longestPauseIndex: profile.longestPauseIndex === null
      ? null
      : clampInteger(profile.longestPauseIndex, 0, 2_000),
    mistakes: profile.mistakes.slice(0, 24).map((mistake) => ({
      expected: Array.from(mistake.expected)[0] ?? '',
      actual: Array.from(mistake.actual)[0] ?? '',
      index: clampInteger(mistake.index, 0, 2_000),
    })),
  };
}

function characterName(character: string) {
  if (character === ' ') return 'space';
  if (character === '') return 'an omitted character';
  return `“${character}”`;
}

function passageExcerpt(passage: string, index: number, radius = 22) {
  const start = Math.max(0, index - Math.floor(radius / 2));
  const end = Math.min(passage.length, index + radius);
  return `${start > 0 ? '…' : ''}${passage.slice(start, end).trim()}${end < passage.length ? '…' : ''}`;
}

function safeKey(value: string) {
  if (value === '') return 'missing';
  if (value === ' ') return 'space';
  return Array.from(value).map((character) => character.codePointAt(0)?.toString(16) ?? '0').join('-');
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]) {
  const mean = average(values) ?? 0;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  return Math.sqrt(variance);
}

function formatSigned(value: number) {
  const rounded = round1(value);
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}`;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function finite(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function clampInteger(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

function capitalize(value: string) {
  return value.length === 0 ? value : `${value[0]!.toUpperCase()}${value.slice(1)}`;
}
