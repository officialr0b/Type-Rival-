export type AcademyFinger =
  | 'left-pinky'
  | 'left-ring'
  | 'left-middle'
  | 'left-index'
  | 'thumbs'
  | 'right-index'
  | 'right-middle'
  | 'right-ring'
  | 'right-pinky';

export type AcademyLessonId =
  | 'home-row'
  | 'anchor-pairs'
  | 'top-row'
  | 'bottom-row'
  | 'clean-words'
  | 'speed-ladder';

export type AcademyLesson = {
  id: AcademyLessonId;
  order: number;
  title: string;
  shortTitle: string;
  level: 'Foundation' | 'Control' | 'Fluency';
  duration: string;
  description: string;
  goal: string;
  coachIntro: string;
  setupChecks: string[];
  drill: string;
  focusKeys: string[];
  passAccuracy: number;
  passStreak: number;
};

export type AcademyLessonProgress = {
  attempts: number;
  completed: boolean;
  bestAccuracy: number;
  bestStreak: number;
  lastPracticedAt: string;
};

export type AcademyProgress = {
  version: 1;
  totalDrills: number;
  lessons: Partial<Record<AcademyLessonId, AcademyLessonProgress>>;
};

export type AcademySummary = {
  accuracy: number;
  longestStreak: number;
  rhythmScore: number;
  keysPerMinute: number;
  passed: boolean;
  weakKeys: Array<{ key: string; misses: number; finger: AcademyFinger }>;
};

export const ACADEMY_STORAGE_KEY = 'typerival:academy:v1';

export const FINGER_LABELS: Record<AcademyFinger, string> = {
  'left-pinky': 'Left pinky',
  'left-ring': 'Left ring finger',
  'left-middle': 'Left middle finger',
  'left-index': 'Left index finger',
  thumbs: 'Either thumb',
  'right-index': 'Right index finger',
  'right-middle': 'Right middle finger',
  'right-ring': 'Right ring finger',
  'right-pinky': 'Right pinky',
};

export const ACADEMY_KEYBOARD_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'],
] as const;

const FINGER_BY_KEY: Record<string, AcademyFinger> = {
  q: 'left-pinky', a: 'left-pinky', z: 'left-pinky',
  w: 'left-ring', s: 'left-ring', x: 'left-ring',
  e: 'left-middle', d: 'left-middle', c: 'left-middle',
  r: 'left-index', f: 'left-index', v: 'left-index', t: 'left-index', g: 'left-index', b: 'left-index',
  y: 'right-index', h: 'right-index', n: 'right-index', u: 'right-index', j: 'right-index', m: 'right-index',
  i: 'right-middle', k: 'right-middle', ',': 'right-middle',
  o: 'right-ring', l: 'right-ring', '.': 'right-ring',
  p: 'right-pinky', ';': 'right-pinky', '/': 'right-pinky',
  ' ': 'thumbs',
};

export const ACADEMY_LESSONS: AcademyLesson[] = [
  {
    id: 'home-row',
    order: 1,
    title: 'Find your home row',
    shortTitle: 'Home row',
    level: 'Foundation',
    duration: '3 min',
    description: 'Build a relaxed starting position on A S D F and J K L ;.',
    goal: 'Use the correct finger for every home-row key without looking down.',
    coachIntro: 'Start slow. Speed arrives after your hands learn where home is.',
    setupChecks: [
      'Sit tall with your shoulders relaxed and elbows near a right angle.',
      'Rest curved fingers on A S D F and J K L ; with both index fingers on the raised bumps.',
      'Float your wrists slightly above the desk. Do not press them into the keyboard.',
    ],
    drill: 'asdf jkl; fj dk sl a; asdf jkl;',
    focusKeys: ['a', 's', 'd', 'f', 'j', 'k', 'l', ';'],
    passAccuracy: 90,
    passStreak: 8,
  },
  {
    id: 'anchor-pairs',
    order: 2,
    title: 'Own the anchor keys',
    shortTitle: 'Anchor pairs',
    level: 'Foundation',
    duration: '4 min',
    description: 'Train both hands to move independently while returning to F and J.',
    goal: 'Alternate hands cleanly and return each finger to its home key.',
    coachIntro: 'Let one hand move while the other stays quiet. Your anchors are F and J.',
    setupChecks: [
      'Keep F and J under your index fingers between every reach.',
      'Move from the knuckle instead of twisting the wrist.',
      'Use a light touch; force makes returning home slower.',
    ],
    drill: 'fj dk sl a; jf kd ls ;a fj dk sl a;',
    focusKeys: ['f', 'j', 'd', 'k', 's', 'l', 'a', ';'],
    passAccuracy: 92,
    passStreak: 10,
  },
  {
    id: 'top-row',
    order: 3,
    title: 'Reach the top row',
    shortTitle: 'Top row',
    level: 'Control',
    duration: '5 min',
    description: 'Reach upward without carrying the whole hand away from home row.',
    goal: 'Strike each top-row key with its assigned finger and return home.',
    coachIntro: 'Reach, tap, return. Small movements keep your next key close.',
    setupChecks: [
      'Keep the unused fingers close to their home-row positions.',
      'Reach diagonally with the finger instead of lifting the entire hand.',
      'Look at the screen, not the keyboard, even when you slow down.',
    ],
    drill: 'qwer uiop rt yu we io qp er tu oi',
    focusKeys: ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    passAccuracy: 92,
    passStreak: 10,
  },
  {
    id: 'bottom-row',
    order: 4,
    title: 'Control the bottom row',
    shortTitle: 'Bottom row',
    level: 'Control',
    duration: '5 min',
    description: 'Learn the downward reaches that often create hand crossing and drift.',
    goal: 'Keep each hand in its own zone while reaching down and returning home.',
    coachIntro: 'Keep your palms centered. Your fingers travel; your hands stay balanced.',
    setupChecks: [
      'Keep your left hand responsible for Z through B and your right for N through slash.',
      'Use the right middle finger for comma and right ring finger for period.',
      'Reset to F and J whenever your hands begin to drift.',
    ],
    drill: 'zxcv nm,./ vb nm cx ,. zv m/ bc n.',
    focusKeys: ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'],
    passAccuracy: 92,
    passStreak: 10,
  },
  {
    id: 'clean-words',
    order: 5,
    title: 'Turn motion into words',
    shortTitle: 'Clean words',
    level: 'Fluency',
    duration: '5 min',
    description: 'Connect trained reaches into useful words without sacrificing accuracy.',
    goal: 'Read one word ahead while your fingers finish the current word.',
    coachIntro: 'Do not sprint at the first letter. Build one smooth rhythm through the word.',
    setupChecks: [
      'Read the complete word before attacking its first letter.',
      'Use either thumb for spaces and return immediately to a relaxed hover.',
      'If tension builds, pause, reset on F and J, and continue cleanly.',
    ],
    drill: 'fast safe data read type rival clean speed calm focus',
    focusKeys: ['f', 'a', 's', 't', 'r', 'e', 'd', 'i', 'v', 'l'],
    passAccuracy: 94,
    passStreak: 14,
  },
  {
    id: 'speed-ladder',
    order: 6,
    title: 'Unlock the next speed',
    shortTitle: 'Speed ladder',
    level: 'Fluency',
    duration: '6 min',
    description: 'Use controlled bursts to raise speed without teaching yourself new mistakes.',
    goal: 'Hold a long clean streak with an even cadence from start to finish.',
    coachIntro: 'Speed is clean motion repeated sooner—not harder key presses.',
    setupChecks: [
      'Begin below your maximum speed and accelerate only while accuracy stays high.',
      'Keep your breathing steady and release tension from your shoulders.',
      'Finish each word before thinking about your score.',
    ],
    drill: 'the quick rival builds speed with calm hands and clean rhythm',
    focusKeys: ['t', 'h', 'e', 'q', 'u', 'i', 'c', 'k', 'r', 'v'],
    passAccuracy: 95,
    passStreak: 18,
  },
];

export function academyFingerForKey(key: string): AcademyFinger {
  return FINGER_BY_KEY[key.toLowerCase()] ?? 'thumbs';
}

export function displayAcademyKey(key: string): string {
  return key === ' ' ? 'SPACE' : key.toUpperCase();
}

export function normalizeAcademyInput(input: string): string[] {
  return Array.from(input.toLowerCase()).filter((character) => character in FINGER_BY_KEY);
}

export function addAdaptiveRepeat(queue: string[], currentIndex: number, key: string): string[] {
  const next = [...queue];
  const insertionPoint = Math.min(next.length, currentIndex + 3);
  next.splice(insertionPoint, 0, key);
  return next;
}

export function calculateAcademySummary({
  correct,
  attempts,
  longestStreak,
  elapsedMs,
  intervals,
  errors,
  lesson,
}: {
  correct: number;
  attempts: number;
  longestStreak: number;
  elapsedMs: number;
  intervals: number[];
  errors: Record<string, number>;
  lesson: AcademyLesson;
}): AcademySummary {
  const accuracy = attempts > 0 ? correct / attempts * 100 : 0;
  const meanInterval = intervals.length > 0
    ? intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length
    : 0;
  const meanDeviation = meanInterval > 0 && intervals.length > 0
    ? intervals.reduce((sum, interval) => sum + Math.abs(interval - meanInterval), 0) / intervals.length
    : meanInterval;
  const rhythmScore = meanInterval > 0
    ? Math.max(0, Math.min(100, 100 - meanDeviation / meanInterval * 100))
    : 0;
  const keysPerMinute = elapsedMs > 0 ? correct / elapsedMs * 60_000 : 0;
  const weakKeys = Object.entries(errors)
    .map(([key, misses]) => ({ key, misses, finger: academyFingerForKey(key) }))
    .sort((left, right) => right.misses - left.misses || left.key.localeCompare(right.key))
    .slice(0, 3);

  return {
    accuracy,
    longestStreak,
    rhythmScore,
    keysPerMinute,
    passed: accuracy >= lesson.passAccuracy && longestStreak >= lesson.passStreak,
    weakKeys,
  };
}

export function emptyAcademyProgress(): AcademyProgress {
  return { version: 1, totalDrills: 0, lessons: {} };
}

export function parseAcademyProgress(value: string | null): AcademyProgress {
  if (!value) return emptyAcademyProgress();
  try {
    const parsed = JSON.parse(value) as Partial<AcademyProgress>;
    if (parsed.version !== 1 || !parsed.lessons || typeof parsed.lessons !== 'object') return emptyAcademyProgress();
    return {
      version: 1,
      totalDrills: Number.isFinite(parsed.totalDrills) ? Math.max(0, Number(parsed.totalDrills)) : 0,
      lessons: parsed.lessons,
    };
  } catch {
    return emptyAcademyProgress();
  }
}

export function recordAcademyLesson(
  progress: AcademyProgress,
  lesson: AcademyLesson,
  summary: AcademySummary,
  completedAt: string,
): AcademyProgress {
  const current = progress.lessons[lesson.id];
  return {
    version: 1,
    totalDrills: progress.totalDrills + 1,
    lessons: {
      ...progress.lessons,
      [lesson.id]: {
        attempts: (current?.attempts ?? 0) + 1,
        completed: Boolean(current?.completed || summary.passed),
        bestAccuracy: Math.max(current?.bestAccuracy ?? 0, summary.accuracy),
        bestStreak: Math.max(current?.bestStreak ?? 0, summary.longestStreak),
        lastPracticedAt: completedAt,
      },
    },
  };
}

export function academyCoachTip(expected: string, misses: number): string {
  const finger = FINGER_LABELS[academyFingerForKey(expected)];
  if (misses >= 3) return `Reset on F and J. Find ${displayAcademyKey(expected)} with your ${finger.toLowerCase()}, then return home.`;
  if (misses === 2) return `Slow the reach down. ${finger} owns ${displayAcademyKey(expected)}.`;
  return `${finger} for ${displayAcademyKey(expected)}. Stay relaxed and try that key again.`;
}
