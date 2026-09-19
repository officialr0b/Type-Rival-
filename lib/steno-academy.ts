export type StenoLessonId =
  | 'writer-ready'
  | 'keyboard-map'
  | 'realtime-theory'
  | 'dictionary-briefs'
  | 'professional-material'
  | 'speed-accuracy';

export type StenoStageId = 'learn' | 'build' | 'master';

export type StenoLessonStage = {
  id: StenoStageId;
  label: string;
  title: string;
  goal: string;
  drill: string;
  focusStrokes: string[];
  passAccuracy: number;
  passCleanWords: number;
};

export type StenoLesson = {
  id: StenoLessonId;
  order: number;
  title: string;
  shortTitle: string;
  level: 'Equipment' | 'Theory' | 'Realtime';
  duration: string;
  description: string;
  coachIntro: string;
  setupChecks: string[];
  knowledge: string[];
  stages: StenoLessonStage[];
};

export type StenoLessonProgress = {
  attempts: number;
  completed: boolean;
  completedStages: StenoStageId[];
  bestAccuracy: number;
  bestCleanWords: number;
  bestWpm: number;
  lastPracticedAt: string;
};

export type StenoProgress = {
  version: 1;
  totalDrills: number;
  lessons: Partial<Record<StenoLessonId, StenoLessonProgress>>;
};

export type StenoSummary = {
  accuracy: number;
  translatedWpm: number;
  cleanWords: number;
  corrections: number;
  passed: boolean;
};

export const STENO_STORAGE_KEY = 'typerival:steno-academy:v1';

// Standard English stenotype order. Individual theories and dictionaries may
// assign different outlines; Academy grades translated text, not one theory.
export const STENO_KEY_ROWS = [
  ['S-', 'T-', 'P-', 'H-', '*', '-F', '-P', '-L', '-T', '-D'],
  ['S-', 'K-', 'W-', 'R-', '*', '-R', '-B', '-G', '-S', '-Z'],
  ['A', 'O', 'E', 'U'],
] as const;

export const STENO_LESSONS: StenoLesson[] = [
  {
    id: 'writer-ready',
    order: 1,
    title: 'Connect your writer',
    shortTitle: 'Writer ready',
    level: 'Equipment',
    duration: '12 min',
    description: 'Build the writer → Plover/CAT → browser chain and prove that translated text reaches TypeRival.',
    coachIntro: 'First make the signal dependable. Speed practice only matters when every translated stroke reaches the page.',
    setupChecks: [
      'Connect a compatible steno writer, an NKRO keyboard, or a professional machine to your computer.',
      'Open Plover or your CAT software, choose the correct machine protocol, and enable translated output.',
      'Focus the TypeRival input field and confirm your writer produces ordinary text here before beginning.',
    ],
    knowledge: [
      'Plover can receive keyboard or writer strokes and send translated text into ordinary applications.',
      'Professional and hobbyist writers may use different USB, serial, HID, or keyboard-emulation paths.',
      'TypeRival reads the translated text your software sends; it does not replace your theory or personal dictionary.',
    ],
    stages: [
      { id: 'learn', label: 'Signal', title: 'Prove the connection', goal: 'Send a short clean translation from your writer into the browser.', drill: 'steno ready', focusStrokes: ['WRITER', 'PLOVER / CAT', 'OUTPUT ON'], passAccuracy: 90, passCleanWords: 2 },
      { id: 'build', label: 'Control', title: 'Test spaces and correction', goal: 'Confirm word boundaries, spacing, and your theory correction stroke behave normally.', drill: 'the writer sends clean text', focusStrokes: ['SPACE', 'UNDO', 'RETRANSLATE'], passAccuracy: 92, passCleanWords: 4 },
      { id: 'master', label: 'Ready', title: 'Hold a stable output chain', goal: 'Translate a complete sentence without leaving the TypeRival field.', drill: 'my writer and translation software are ready to practice.', focusStrokes: ['WRITER', 'DICTIONARY', 'BROWSER'], passAccuracy: 94, passCleanWords: 8 },
    ],
  },
  {
    id: 'keyboard-map',
    order: 2,
    title: 'Read the steno keyboard',
    shortTitle: 'Keyboard map',
    level: 'Equipment',
    duration: '15 min',
    description: 'Learn the left initial bank, vowel keys, asterisk, and right final bank as one ordered chord system.',
    coachIntro: 'A steno stroke is a chord, not a row of letters. Press the idea together and release it together.',
    setupChecks: [
      'Rest fingers lightly across both consonant banks with thumbs over the vowel keys.',
      'Keep wrists neutral and use the smallest motion that fully depresses the intended keys.',
      'Read outlines in steno order: left bank, vowels, asterisk, then right bank.',
    ],
    knowledge: [
      'Left-bank keys generally express beginning sounds; right-bank keys generally express ending sounds.',
      'A, O, E, and U sit under the thumbs; the asterisk is commonly used for corrections and alternate outlines.',
      'Some letters and sounds are represented by key combinations, so an outline is read by position as well as symbol.',
    ],
    stages: [
      { id: 'learn', label: 'Map', title: 'Name the three zones', goal: 'Keep the left bank, vowel core, and right bank distinct while translating.', drill: 'left bank vowel core right bank', focusStrokes: ['STKPWHR-', 'AO*EU', '-FRPBLGTSDZ'], passAccuracy: 92, passCleanWords: 6 },
      { id: 'build', label: 'Chord', title: 'Press and release together', goal: 'Avoid rolling a stroke into separate keys; make every chord one coordinated motion.', drill: 'press together release together reset softly', focusStrokes: ['DOWN TOGETHER', 'UP TOGETHER', 'RESET'], passAccuracy: 94, passCleanWords: 6 },
      { id: 'master', label: 'Readback', title: 'Read outlines in order', goal: 'Build the habit of reading what the writer recorded, not what you hoped to write.', drill: 'read the outline check the translation correct the cause', focusStrokes: ['STENO ORDER', 'PAPER TAPE', 'READBACK'], passAccuracy: 95, passCleanWords: 8 },
    ],
  },
  {
    id: 'realtime-theory',
    order: 3,
    title: 'Build realtime theory',
    shortTitle: 'Theory',
    level: 'Theory',
    duration: '18 min',
    description: 'Connect sound, syllable shape, punctuation, and word boundaries through the theory you are learning.',
    coachIntro: 'Write the sound your theory expects. Clean realtime begins with repeatable decisions, not improvised outlines.',
    setupChecks: [
      'Use one theory consistently for this drill; do not mix outlines from unrelated systems.',
      'Say or hear the sound before choosing the stroke instead of spelling letter by letter.',
      'Keep punctuation and spacing visible in your translation window while you practice.',
    ],
    knowledge: [
      'Realtime theory maps spoken sounds and common language patterns to machine outlines.',
      'Phonetic decisions, punctuation, and word boundaries must translate predictably before speedbuilding.',
      'Readback exposes hesitation, shadowing, and outline conflicts that raw WPM can hide.',
    ],
    stages: [
      { id: 'learn', label: 'Sound', title: 'Write sound before spelling', goal: 'Translate short phonetic language without falling back to letter-by-letter thinking.', drill: 'calm hands hear the sound and write the word', focusStrokes: ['INITIAL', 'VOWEL', 'FINAL'], passAccuracy: 93, passCleanWords: 9 },
      { id: 'build', label: 'Shape', title: 'Hold word boundaries', goal: 'Preserve clean spaces while joining prefixes, roots, suffixes, and punctuation.', drill: 'clear word boundaries make realtime translation easy to read.', focusStrokes: ['PREFIX', 'ROOT', 'SUFFIX'], passAccuracy: 95, passCleanWords: 9 },
      { id: 'master', label: 'Realtime', title: 'Translate a complete thought', goal: 'Write a sentence that arrives readable without post-run repair.', drill: 'the reporter listens ahead while each finished phrase appears in realtime.', focusStrokes: ['PHRASE', 'PUNCTUATION', 'READBACK'], passAccuracy: 96, passCleanWords: 11 },
    ],
  },
  {
    id: 'dictionary-briefs',
    order: 4,
    title: 'Control briefs and dictionaries',
    shortTitle: 'Briefs',
    level: 'Theory',
    duration: '20 min',
    description: 'Use high-value briefs deliberately, identify conflicts, and keep a dictionary you can trust under pressure.',
    coachIntro: 'A brief only saves time when it translates every time. Reliability beats a clever outline you cannot recall.',
    setupChecks: [
      'Open your active dictionary stack and know which dictionary has priority.',
      'Use briefs already taught by your theory or intentionally added to your personal dictionary.',
      'Keep suggestions or paper tape visible so mistranslations can be traced to their source outline.',
    ],
    knowledge: [
      'Briefs compress common words or phrases, but uncertain recall can cost more time than it saves.',
      'Conflicts occur when one outline can translate more than one way; dictionary structure and context must resolve them.',
      'Job dictionaries, names, technical terms, and consistent backup habits are part of professional preparation.',
    ],
    stages: [
      { id: 'learn', label: 'Briefs', title: 'Use only reliable briefs', goal: 'Write frequent language with outlines you can recall without hesitation.', drill: 'at this time we can make a clear record', focusStrokes: ['COMMON WORDS', 'PHRASES', 'RECALL'], passAccuracy: 94, passCleanWords: 9 },
      { id: 'build', label: 'Conflicts', title: 'Catch translation conflicts', goal: 'Notice an unexpected translation, inspect the outline, and repair the dictionary decision.', drill: 'check each conflict before it becomes a repeated mistranslation.', focusStrokes: ['OUTLINE', 'TRANSLATION', 'PRIORITY'], passAccuracy: 95, passCleanWords: 9 },
      { id: 'master', label: 'Dictionary', title: 'Prepare the job vocabulary', goal: 'Treat names and subject terms as preparation, not surprises during the event.', drill: 'research names terms and phrases before the realtime assignment begins.', focusStrokes: ['NAMES', 'TERMS', 'JOB DICTIONARY'], passAccuracy: 96, passCleanWords: 10 },
    ],
  },
  {
    id: 'professional-material',
    order: 5,
    title: 'Write professional material',
    shortTitle: 'Material types',
    level: 'Realtime',
    duration: '24 min',
    description: 'Separate the language patterns of literary, jury-charge, and two-voice testimony material.',
    coachIntro: 'Different material changes the mental load. Train the vocabulary, cadence, and speaker handling—not one generic speed.',
    setupChecks: [
      'Keep your active theory, punctuation, and speaker conventions consistent across the run.',
      'Preview unfamiliar legal, medical, and technical terms before timed material when preparation is allowed.',
      'Mark hesitation and mistranslation patterns for review instead of judging the run by WPM alone.',
    ],
    knowledge: [
      'Literary material tests continuous prose; jury charge emphasizes formal legal language and phrasing.',
      'Testimony and Q&A add speaker changes, interruptions, names, and specialized vocabulary.',
      'Court reporting, CART, and captioning share realtime foundations but require different conventions and preparation.',
    ],
    stages: [
      { id: 'learn', label: 'Literary', title: 'Hold continuous prose', goal: 'Keep an even rhythm through descriptive language and varied sentence structure.', drill: 'morning light crossed the room while the city slowly gathered its rhythm.', focusStrokes: ['LITERARY', 'PUNCTUATION', 'CADENCE'], passAccuracy: 95, passCleanWords: 11 },
      { id: 'build', label: 'Jury charge', title: 'Control formal legal phrasing', goal: 'Maintain exact wording through dense instructions and repeated legal terms.', drill: 'members of the jury must consider the evidence and follow the law.', focusStrokes: ['JURY CHARGE', 'LEGAL TERMS', 'VERBATIM'], passAccuracy: 95, passCleanWords: 12 },
      { id: 'master', label: 'Testimony', title: 'Handle two voices', goal: 'Preserve question-and-answer structure while staying ready for names and technical terms.', drill: 'question where were you standing answer beside the north entrance.', focusStrokes: ['QUESTION', 'ANSWER', 'SPEAKER CHANGE'], passAccuracy: 96, passCleanWords: 10 },
    ],
  },
  {
    id: 'speed-accuracy',
    order: 6,
    title: 'Build professional speed',
    shortTitle: 'Speed ladder',
    level: 'Realtime',
    duration: '30 min',
    description: 'Use unfamiliar material, controlled speed increases, transcript review, and a 95% accuracy floor.',
    coachIntro: 'Speedbuilding is repeated accurate exposure. Raise the pace in small steps and study what breaks first.',
    setupChecks: [
      'Choose a starting pace you can sustain with at least 95% accuracy on unfamiliar material.',
      'Practice above goal speed in short bursts, then return to a controlled pace for consolidation.',
      'Review steno notes and the first translation after every run; record error families and dictionary work.',
    ],
    knowledge: [
      'Professional training uses incremental speeds, unfamiliar material, timed transcription, and regular readback.',
      'The RPR skills standard is five minutes at 180 WPM literary, 200 WPM jury charge, and 225 WPM testimony/Q&A, each at 95% accuracy.',
      'TypeRival Academy is supplemental practice, not an accredited program, certification test, or substitute for instructor feedback.',
    ],
    stages: [
      { id: 'learn', label: 'Baseline', title: 'Set an honest baseline', goal: 'Find the fastest pace that still produces dependable, readable translation.', drill: 'accuracy creates the baseline that speed practice can safely build upon.', focusStrokes: ['95% FLOOR', 'UNFAMILIAR COPY', 'REVIEW'], passAccuracy: 95, passCleanWords: 10 },
      { id: 'build', label: 'Pyramid', title: 'Climb and consolidate', goal: 'Alternate short faster bursts with accurate recovery material.', drill: 'raise the pace for a short burst then return to clean controlled realtime.', focusStrokes: ['BURST', 'RECOVER', 'REPEAT'], passAccuracy: 95, passCleanWords: 13 },
      { id: 'master', label: 'Professional', title: 'Train toward the material goals', goal: 'Keep accuracy first while tracking literary, jury-charge, and testimony speeds separately.', drill: 'professional speed is accurate repeatable and ready for unfamiliar voices.', focusStrokes: ['180 LIT', '200 JC', '225 QA'], passAccuracy: 96, passCleanWords: 10 },
    ],
  },
];

export function normalizeStenoText(value: string): string {
  return value
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc\uff07]/g, "'")
    .replace(/[\u201c\u201d\uff02]/g, '"')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/[\r\n\u200b]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function calculateStenoSummary({
  target,
  input,
  elapsedMs,
  corrections,
  stage,
}: {
  target: string;
  input: string;
  elapsedMs: number;
  corrections: number;
  stage: StenoLessonStage;
}): StenoSummary {
  const expected = Array.from(normalizeStenoText(target));
  const actual = Array.from(normalizeStenoText(input));
  const comparedLength = Math.max(expected.length, actual.length, 1);
  let correct = 0;
  for (let index = 0; index < Math.min(expected.length, actual.length); index += 1) {
    if (expected[index] === actual[index]) correct += 1;
  }
  const accuracy = correct / comparedLength * 100;
  const expectedWords = normalizeStenoText(target).split(' ').filter(Boolean);
  const actualWords = normalizeStenoText(input).split(' ').filter(Boolean);
  let cleanWords = 0;
  for (let index = 0; index < Math.min(expectedWords.length, actualWords.length); index += 1) {
    if (expectedWords[index] === actualWords[index]) cleanWords += 1;
  }
  const translatedWpm = correct / 5 / (Math.max(1_000, elapsedMs) / 60_000);
  return {
    accuracy,
    translatedWpm,
    cleanWords,
    corrections,
    passed: accuracy >= stage.passAccuracy && cleanWords >= stage.passCleanWords,
  };
}

export function emptyStenoProgress(): StenoProgress {
  return { version: 1, totalDrills: 0, lessons: {} };
}

export function parseStenoProgress(value: string | null): StenoProgress {
  if (!value) return emptyStenoProgress();
  try {
    const parsed = JSON.parse(value) as Partial<StenoProgress>;
    if (parsed.version !== 1 || !parsed.lessons || typeof parsed.lessons !== 'object') return emptyStenoProgress();
    const lessons: StenoProgress['lessons'] = {};
    for (const lesson of STENO_LESSONS) {
      const saved = parsed.lessons[lesson.id];
      if (!saved) continue;
      const completedStages = lesson.stages.map((stage) => stage.id).filter((id) => saved.completedStages?.includes(id));
      lessons[lesson.id] = {
        attempts: Number.isFinite(saved.attempts) ? Math.max(0, Number(saved.attempts)) : 0,
        completed: lesson.stages.every((stage) => completedStages.includes(stage.id)),
        completedStages,
        bestAccuracy: Number.isFinite(saved.bestAccuracy) ? Math.max(0, Number(saved.bestAccuracy)) : 0,
        bestCleanWords: Number.isFinite(saved.bestCleanWords) ? Math.max(0, Number(saved.bestCleanWords)) : 0,
        bestWpm: Number.isFinite(saved.bestWpm) ? Math.max(0, Number(saved.bestWpm)) : 0,
        lastPracticedAt: typeof saved.lastPracticedAt === 'string' ? saved.lastPracticedAt : '',
      };
    }
    return {
      version: 1,
      totalDrills: Number.isFinite(parsed.totalDrills) ? Math.max(0, Number(parsed.totalDrills)) : 0,
      lessons,
    };
  } catch {
    return emptyStenoProgress();
  }
}

export function recordStenoStage(
  progress: StenoProgress,
  lesson: StenoLesson,
  stage: StenoLessonStage,
  summary: StenoSummary,
  completedAt: string,
): StenoProgress {
  const current = progress.lessons[lesson.id];
  const completedStages = summary.passed
    ? lesson.stages.map((candidate) => candidate.id).filter((id) => id === stage.id || current?.completedStages.includes(id))
    : current?.completedStages ?? [];
  return {
    version: 1,
    totalDrills: progress.totalDrills + 1,
    lessons: {
      ...progress.lessons,
      [lesson.id]: {
        attempts: (current?.attempts ?? 0) + 1,
        completed: lesson.stages.every((candidate) => completedStages.includes(candidate.id)),
        completedStages,
        bestAccuracy: Math.max(current?.bestAccuracy ?? 0, summary.accuracy),
        bestCleanWords: Math.max(current?.bestCleanWords ?? 0, summary.cleanWords),
        bestWpm: Math.max(current?.bestWpm ?? 0, summary.translatedWpm),
        lastPracticedAt: completedAt,
      },
    },
  };
}

export function firstIncompleteStenoStage(lesson: StenoLesson, progress: StenoLessonProgress | undefined): number {
  const index = lesson.stages.findIndex((stage) => !progress?.completedStages.includes(stage.id));
  return index === -1 ? lesson.stages.length - 1 : index;
}
