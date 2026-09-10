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

export type AcademyStageId = 'learn' | 'build' | 'master';

export type AcademyLessonStage = {
  id: AcademyStageId;
  label: string;
  title: string;
  goal: string;
  drill: string;
  passAccuracy: number;
  passStreak: number;
};

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
  stages: AcademyLessonStage[];
  focusKeys: string[];
};

export type AcademyLessonProgress = {
  attempts: number;
  completed: boolean;
  completedStages: AcademyStageId[];
  bestAccuracy: number;
  bestStreak: number;
  bestKeysPerMinute: number;
  lastPracticedAt: string;
};

export type AcademyProgress = {
  version: 2;
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

// Keep the original key so existing players receive the version-two migration
// instead of losing the Academy work already stored on their device.
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
    duration: '8 min',
    description: 'Build a relaxed starting position on A S D F and J K L ;.',
    goal: 'Use the correct finger for every home-row key without looking down.',
    coachIntro: 'Start slow. Speed arrives after your hands learn where home is.',
    setupChecks: [
      'Sit tall with your shoulders relaxed and elbows near a right angle.',
      'Rest curved fingers on A S D F and J K L ; with both index fingers on the raised bumps.',
      'Float your wrists slightly above the desk. Do not press them into the keyboard.',
    ],
    stages: [
      {
        id: 'learn',
        label: 'Learn',
        title: 'Place every home-row finger',
        goal: 'Find each home-row key calmly and return to the starting shape after every press.',
        drill: 'asdf jkl; fj dk sl a; asdf jkl;',
        passAccuracy: 90,
        passStreak: 8,
      },
      {
        id: 'build',
        label: 'Build',
        title: 'Balance both hands',
        goal: 'Alternate left and right hands without letting either wrist drift.',
        drill: 'a; sl dk fj as df jk l; fj dk sl a;',
        passAccuracy: 92,
        passStreak: 12,
      },
      {
        id: 'master',
        label: 'Master',
        title: 'Turn home row into language',
        goal: 'Connect home-row letters into short words while preserving your finger assignments.',
        drill: 'sad lad fall ask; flask salad; dad asks all;',
        passAccuracy: 94,
        passStreak: 16,
      },
    ],
    focusKeys: ['a', 's', 'd', 'f', 'j', 'k', 'l', ';'],
  },
  {
    id: 'anchor-pairs',
    order: 2,
    title: 'Own the anchor keys',
    shortTitle: 'Anchor pairs',
    level: 'Foundation',
    duration: '9 min',
    description: 'Train both hands to move independently while returning to F and J.',
    goal: 'Alternate hands cleanly and return each finger to its home key.',
    coachIntro: 'Let one hand move while the other stays quiet. Your anchors are F and J.',
    setupChecks: [
      'Keep F and J under your index fingers between every reach.',
      'Move from the knuckle instead of twisting the wrist.',
      'Use a light touch; force makes returning home slower.',
    ],
    stages: [
      {
        id: 'learn',
        label: 'Learn',
        title: 'Lock onto F and J',
        goal: 'Alternate the two anchor keys and feel the raised markers without looking down.',
        drill: 'fj jf fj jf fd jk fj dk sl a;',
        passAccuracy: 92,
        passStreak: 10,
      },
      {
        id: 'build',
        label: 'Build',
        title: 'Move away and return',
        goal: 'Let one finger travel while the index fingers keep finding the anchors.',
        drill: 'fa ju de ki sl a; jf kd ls ;a fj dk sl a;',
        passAccuracy: 93,
        passStreak: 14,
      },
      {
        id: 'master',
        label: 'Master',
        title: 'Anchor through real patterns',
        goal: 'Keep F and J as your reference points through longer home-row combinations.',
        drill: 'fall; flask; ask dad; salad; all lads fall;',
        passAccuracy: 95,
        passStreak: 18,
      },
    ],
    focusKeys: ['f', 'j', 'd', 'k', 's', 'l', 'a', ';'],
  },
  {
    id: 'top-row',
    order: 3,
    title: 'Reach the top row',
    shortTitle: 'Top row',
    level: 'Control',
    duration: '12 min',
    description: 'Reach upward without carrying the whole hand away from home row.',
    goal: 'Strike each top-row key with its assigned finger and return home.',
    coachIntro: 'Reach, tap, return. Small movements keep your next key close.',
    setupChecks: [
      'Keep the unused fingers close to their home-row positions.',
      'Reach diagonally with the finger instead of lifting the entire hand.',
      'Look at the screen, not the keyboard, even when you slow down.',
    ],
    stages: [
      {
        id: 'learn',
        label: 'Learn',
        title: 'Reach, tap, return',
        goal: 'Touch every top-row key with its assigned finger, then come straight home.',
        drill: 'qwer uiop rt yu we io qp er tu oi',
        passAccuracy: 92,
        passStreak: 10,
      },
      {
        id: 'build',
        label: 'Build',
        title: 'Control diagonal reaches',
        goal: 'Mix top-row reaches with home-row resets without lifting the whole hand.',
        drill: 'qa ws ed rf tg yh uj ik ol p; type quiet power',
        passAccuracy: 93,
        passStreak: 14,
      },
      {
        id: 'master',
        label: 'Master',
        title: 'Read ahead on the top row',
        goal: 'Type complete words while returning each reaching finger to its home position.',
        drill: 'write quiet routes; power grows through proper practice',
        passAccuracy: 95,
        passStreak: 20,
      },
    ],
    focusKeys: ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  },
  {
    id: 'bottom-row',
    order: 4,
    title: 'Control the bottom row',
    shortTitle: 'Bottom row',
    level: 'Control',
    duration: '12 min',
    description: 'Learn the downward reaches that often create hand crossing and drift.',
    goal: 'Keep each hand in its own zone while reaching down and returning home.',
    coachIntro: 'Keep your palms centered. Your fingers travel; your hands stay balanced.',
    setupChecks: [
      'Keep your left hand responsible for Z through B and your right for N through slash.',
      'Use the right middle finger for comma and right ring finger for period.',
      'Reset to F and J whenever your hands begin to drift.',
    ],
    stages: [
      {
        id: 'learn',
        label: 'Learn',
        title: 'Reach down without collapsing',
        goal: 'Move each assigned finger down and return before the next reach.',
        drill: 'zxcv nm,./ vb nm cx ,. zv m/ bc n.',
        passAccuracy: 92,
        passStreak: 10,
      },
      {
        id: 'build',
        label: 'Build',
        title: 'Protect each hand zone',
        goal: 'Mix bottom and home rows while keeping the left and right hands from crossing.',
        drill: 'za xs dc fv gb hn jm k, l. ;/ cv bn xm,',
        passAccuracy: 93,
        passStreak: 14,
      },
      {
        id: 'master',
        label: 'Master',
        title: 'Stabilize bottom-row words',
        goal: 'Keep your palms centered while bottom-row letters appear inside full words.',
        drill: 'calm hands move; zoom back, mix clean rhythm.',
        passAccuracy: 95,
        passStreak: 20,
      },
    ],
    focusKeys: ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'],
  },
  {
    id: 'clean-words',
    order: 5,
    title: 'Turn motion into words',
    shortTitle: 'Clean words',
    level: 'Fluency',
    duration: '12 min',
    description: 'Connect trained reaches into useful words without sacrificing accuracy.',
    goal: 'Read one word ahead while your fingers finish the current word.',
    coachIntro: 'Do not sprint at the first letter. Build one smooth rhythm through the word.',
    setupChecks: [
      'Read the complete word before attacking its first letter.',
      'Use either thumb for spaces and return immediately to a relaxed hover.',
      'If tension builds, pause, reset on F and J, and continue cleanly.',
    ],
    stages: [
      {
        id: 'learn',
        label: 'Learn',
        title: 'Connect clean words',
        goal: 'Finish each word as one motion and use a deliberate space between words.',
        drill: 'fast safe data read type rival clean speed calm focus',
        passAccuracy: 94,
        passStreak: 14,
      },
      {
        id: 'build',
        label: 'Build',
        title: 'Look one word ahead',
        goal: 'Let your eyes prepare the next word while your hands finish the current one.',
        drill: 'steady hands build clear words with patient rhythm',
        passAccuracy: 95,
        passStreak: 20,
      },
      {
        id: 'master',
        label: 'Master',
        title: 'Hold flow through a sentence',
        goal: 'Keep one continuous cadence through easy and difficult letter combinations.',
        drill: 'clean technique turns careful practice into repeatable speed.',
        passAccuracy: 96,
        passStreak: 24,
      },
    ],
    focusKeys: ['f', 'a', 's', 't', 'r', 'e', 'd', 'i', 'v', 'l'],
  },
  {
    id: 'speed-ladder',
    order: 6,
    title: 'Unlock the next speed',
    shortTitle: 'Speed ladder',
    level: 'Fluency',
    duration: '15 min',
    description: 'Use controlled bursts to raise speed without teaching yourself new mistakes.',
    goal: 'Hold a long clean streak with an even cadence from start to finish.',
    coachIntro: 'Speed is clean motion repeated sooner—not harder key presses.',
    setupChecks: [
      'Begin below your maximum speed and accelerate only while accuracy stays high.',
      'Keep your breathing steady and release tension from your shoulders.',
      'Finish each word before thinking about your score.',
    ],
    stages: [
      {
        id: 'learn',
        label: 'Baseline',
        title: 'Establish controlled speed',
        goal: 'Set a clean baseline pace before asking your hands to accelerate.',
        drill: 'the quick rival builds speed with calm hands and clean rhythm',
        passAccuracy: 95,
        passStreak: 18,
      },
      {
        id: 'build',
        label: 'Climb',
        title: 'Accelerate through easy words',
        goal: 'Increase pressure in short bursts, then settle immediately back into control.',
        drill: 'steady pace, quick burst, steady pace, clean hands, faster flow',
        passAccuracy: 95,
        passStreak: 24,
      },
      {
        id: 'master',
        label: 'Peak',
        title: 'Prove the speed is repeatable',
        goal: 'Finish a longer run with high accuracy and no breakdown in the closing words.',
        drill: 'smooth rhythm turns accurate motion into speed you can repeat under pressure.',
        passAccuracy: 96,
        passStreak: 30,
      },
    ],
    focusKeys: ['t', 'h', 'e', 'q', 'u', 'i', 'c', 'k', 'r', 'v'],
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

export function calculateAcademySummary({
  correct,
  attempts,
  longestStreak,
  elapsedMs,
  intervals,
  errors,
  stage,
}: {
  correct: number;
  attempts: number;
  longestStreak: number;
  elapsedMs: number;
  intervals: number[];
  errors: Record<string, number>;
  stage: AcademyLessonStage;
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
    passed: accuracy >= stage.passAccuracy && longestStreak >= stage.passStreak,
    weakKeys,
  };
}

export function emptyAcademyProgress(): AcademyProgress {
  return { version: 2, totalDrills: 0, lessons: {} };
}

export function parseAcademyProgress(value: string | null): AcademyProgress {
  if (!value) return emptyAcademyProgress();
  try {
    const parsed = JSON.parse(value) as {
      version?: number;
      totalDrills?: number;
      lessons?: Partial<Record<AcademyLessonId, Partial<AcademyLessonProgress>>>;
    };
    if ((parsed.version !== 1 && parsed.version !== 2) || !parsed.lessons || typeof parsed.lessons !== 'object') return emptyAcademyProgress();
    const lessons: AcademyProgress['lessons'] = {};
    for (const lesson of ACADEMY_LESSONS) {
      const saved = parsed.lessons[lesson.id];
      if (!saved) continue;
      const completedStages = parsed.version === 1
        ? saved.completed ? [lesson.stages[0]!.id] : []
        : Array.isArray(saved.completedStages)
          ? lesson.stages.map((stage) => stage.id).filter((stageId) => saved.completedStages?.includes(stageId))
          : [];
      lessons[lesson.id] = {
        attempts: Number.isFinite(saved.attempts) ? Math.max(0, Number(saved.attempts)) : 0,
        completed: lesson.stages.every((stage) => completedStages.includes(stage.id)),
        completedStages,
        bestAccuracy: Number.isFinite(saved.bestAccuracy) ? Math.max(0, Number(saved.bestAccuracy)) : 0,
        bestStreak: Number.isFinite(saved.bestStreak) ? Math.max(0, Number(saved.bestStreak)) : 0,
        bestKeysPerMinute: Number.isFinite(saved.bestKeysPerMinute) ? Math.max(0, Number(saved.bestKeysPerMinute)) : 0,
        lastPracticedAt: typeof saved.lastPracticedAt === 'string' ? saved.lastPracticedAt : '',
      };
    }
    return {
      version: 2,
      totalDrills: Number.isFinite(parsed.totalDrills) ? Math.max(0, Number(parsed.totalDrills)) : 0,
      lessons,
    };
  } catch {
    return emptyAcademyProgress();
  }
}

export function recordAcademyLesson(
  progress: AcademyProgress,
  lesson: AcademyLesson,
  stage: AcademyLessonStage,
  summary: AcademySummary,
  completedAt: string,
): AcademyProgress {
  const current = progress.lessons[lesson.id];
  const completedStages = summary.passed
    ? lesson.stages.map((candidate) => candidate.id).filter((stageId) => stageId === stage.id || current?.completedStages.includes(stageId))
    : current?.completedStages ?? [];
  return {
    version: 2,
    totalDrills: progress.totalDrills + 1,
    lessons: {
      ...progress.lessons,
      [lesson.id]: {
        attempts: (current?.attempts ?? 0) + 1,
        completed: lesson.stages.every((candidate) => completedStages.includes(candidate.id)),
        completedStages,
        bestAccuracy: Math.max(current?.bestAccuracy ?? 0, summary.accuracy),
        bestStreak: Math.max(current?.bestStreak ?? 0, summary.longestStreak),
        bestKeysPerMinute: Math.max(current?.bestKeysPerMinute ?? 0, summary.keysPerMinute),
        lastPracticedAt: completedAt,
      },
    },
  };
}

export function firstIncompleteAcademyStage(lesson: AcademyLesson, progress: AcademyLessonProgress | undefined): number {
  const completedStages = progress?.completedStages ?? [];
  const index = lesson.stages.findIndex((stage) => !completedStages.includes(stage.id));
  return index === -1 ? lesson.stages.length - 1 : index;
}

export function academyCoachTip(expected: string, misses: number): string {
  const finger = FINGER_LABELS[academyFingerForKey(expected)];
  if (misses >= 3) return `Reset on F and J. Find ${displayAcademyKey(expected)} with your ${finger.toLowerCase()}, then return home.`;
  if (misses === 2) return `Slow the reach down. ${finger} owns ${displayAcademyKey(expected)}.`;
  return `${finger} for ${displayAcademyKey(expected)}. Stay relaxed and try that key again.`;
}
