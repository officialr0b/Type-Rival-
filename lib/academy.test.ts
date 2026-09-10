import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACADEMY_LESSONS,
  academyFingerForKey,
  calculateAcademySummary,
  firstIncompleteAcademyStage,
  normalizeAcademyInput,
  parseAcademyProgress,
  recordAcademyLesson,
} from './academy.ts';

test('maps representative keys to the correct touch-typing fingers', () => {
  assert.equal(academyFingerForKey('a'), 'left-pinky');
  assert.equal(academyFingerForKey('t'), 'left-index');
  assert.equal(academyFingerForKey('y'), 'right-index');
  assert.equal(academyFingerForKey('.'), 'right-ring');
  assert.equal(academyFingerForKey(' '), 'thumbs');
});

test('normalizes drills to supported lowercase keyboard input', () => {
  assert.deepEqual(normalizeAcademyInput('A!s F'), ['a', 's', ' ', 'f']);
});

test('every Academy lesson has a playable drill and achievable standards', () => {
  assert.equal(new Set(ACADEMY_LESSONS.map((lesson) => lesson.id)).size, ACADEMY_LESSONS.length);
  for (const lesson of ACADEMY_LESSONS) {
    assert.equal(lesson.stages.length, 3, `${lesson.id} needs three mastery stages`);
    assert.deepEqual(lesson.stages.map((stage) => stage.id), ['learn', 'build', 'master']);
    for (const stage of lesson.stages) {
      const drill = normalizeAcademyInput(stage.drill);
      assert.ok(drill.length >= stage.passStreak, `${lesson.id}/${stage.id} needs enough keys for its streak target`);
      assert.ok(stage.passAccuracy >= 90 && stage.passAccuracy <= 100, `${lesson.id}/${stage.id} has an invalid accuracy target`);
    }
    assert.ok(lesson.focusKeys.every((key) => normalizeAcademyInput(key).length === 1), `${lesson.id} has an unsupported focus key`);
  }
});

test('Academy drills preserve their authored text after normalization', () => {
  const speedStage = ACADEMY_LESSONS.find((lesson) => lesson.id === 'speed-ladder')!.stages[0]!;
  assert.equal(normalizeAcademyInput(speedStage.drill).join(''), speedStage.drill);
});

test('summary enforces lesson accuracy and streak standards', () => {
  const lesson = ACADEMY_LESSONS[0];
  const stage = lesson.stages[0]!;
  const passed = calculateAcademySummary({
    correct: 20,
    attempts: 21,
    longestStreak: 12,
    elapsedMs: 10_000,
    intervals: [500, 520, 490],
    errors: { a: 1 },
    stage,
  });
  assert.equal(passed.passed, true);
  assert.equal(passed.weakKeys[0]?.finger, 'left-pinky');

  const inaccurate = calculateAcademySummary({
    correct: 20,
    attempts: 30,
    longestStreak: 20,
    elapsedMs: 10_000,
    intervals: [],
    errors: { s: 10 },
    stage,
  });
  assert.equal(inaccurate.passed, false);
});

test('progress parsing is defensive and preserves the best lesson result', () => {
  assert.equal(parseAcademyProgress('{broken').totalDrills, 0);
  const lesson = ACADEMY_LESSONS[0];
  const firstStage = lesson.stages[0]!;
  const secondStage = lesson.stages[1]!;
  const first = recordAcademyLesson(parseAcademyProgress(null), lesson, firstStage, {
    accuracy: 96,
    longestStreak: 12,
    rhythmScore: 88,
    keysPerMinute: 150,
    passed: true,
    weakKeys: [],
  }, '2026-09-08T00:00:00.000Z');
  const second = recordAcademyLesson(first, lesson, secondStage, {
    accuracy: 80,
    longestStreak: 5,
    rhythmScore: 70,
    keysPerMinute: 120,
    passed: false,
    weakKeys: [],
  }, '2026-09-08T01:00:00.000Z');
  assert.equal(second.lessons['home-row']?.completed, false);
  assert.deepEqual(second.lessons['home-row']?.completedStages, ['learn']);
  assert.equal(second.lessons['home-row']?.bestAccuracy, 96);
  assert.equal(second.lessons['home-row']?.attempts, 2);
  assert.equal(second.lessons['home-row']?.bestKeysPerMinute, 150);
  assert.equal(firstIncompleteAcademyStage(lesson, second.lessons['home-row']), 1);
});

test('migrates previously mastered one-pass lessons into the first mastery stage', () => {
  const migrated = parseAcademyProgress(JSON.stringify({
    version: 1,
    totalDrills: 6,
    lessons: {
      'speed-ladder': {
        attempts: 1,
        completed: true,
        bestAccuracy: 98,
        bestStreak: 40,
        lastPracticedAt: '2026-09-09T00:00:00.000Z',
      },
    },
  }));
  assert.equal(migrated.version, 2);
  assert.equal(migrated.lessons['speed-ladder']?.completed, false);
  assert.deepEqual(migrated.lessons['speed-ladder']?.completedStages, ['learn']);
  assert.equal(firstIncompleteAcademyStage(ACADEMY_LESSONS[5], migrated.lessons['speed-ladder']), 1);
});

test('requires all three successful stages before a lesson is mastered', () => {
  const lesson = ACADEMY_LESSONS[0];
  const passingSummary = {
    accuracy: 100,
    longestStreak: 100,
    rhythmScore: 90,
    keysPerMinute: 180,
    passed: true,
    weakKeys: [],
  };
  let progress = parseAcademyProgress(null);
  for (const [index, stage] of lesson.stages.entries()) {
    progress = recordAcademyLesson(progress, lesson, stage, passingSummary, `2026-09-09T0${index}:00:00.000Z`);
    assert.equal(progress.lessons['home-row']?.completed, index === lesson.stages.length - 1);
  }
  assert.deepEqual(progress.lessons['home-row']?.completedStages, ['learn', 'build', 'master']);
});
