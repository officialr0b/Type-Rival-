import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACADEMY_LESSONS,
  academyFingerForKey,
  addAdaptiveRepeat,
  calculateAcademySummary,
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
    const drill = normalizeAcademyInput(lesson.drill);
    assert.ok(drill.length >= lesson.passStreak, `${lesson.id} needs enough keys for its streak target`);
    assert.ok(lesson.focusKeys.every((key) => normalizeAcademyInput(key).length === 1), `${lesson.id} has an unsupported focus key`);
    assert.ok(lesson.passAccuracy >= 90 && lesson.passAccuracy <= 100, `${lesson.id} has an invalid accuracy target`);
  }
});

test('adaptive repetition adds a missed key shortly after the current target', () => {
  assert.deepEqual(addAdaptiveRepeat(['a', 's', 'd', 'f'], 0, 'a'), ['a', 's', 'd', 'a', 'f']);
});

test('summary enforces lesson accuracy and streak standards', () => {
  const lesson = ACADEMY_LESSONS[0];
  const passed = calculateAcademySummary({
    correct: 20,
    attempts: 21,
    longestStreak: 12,
    elapsedMs: 10_000,
    intervals: [500, 520, 490],
    errors: { a: 1 },
    lesson,
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
    lesson,
  });
  assert.equal(inaccurate.passed, false);
});

test('progress parsing is defensive and preserves the best lesson result', () => {
  assert.equal(parseAcademyProgress('{broken').totalDrills, 0);
  const lesson = ACADEMY_LESSONS[0];
  const first = recordAcademyLesson(parseAcademyProgress(null), lesson, {
    accuracy: 96,
    longestStreak: 12,
    rhythmScore: 88,
    keysPerMinute: 150,
    passed: true,
    weakKeys: [],
  }, '2026-09-08T00:00:00.000Z');
  const second = recordAcademyLesson(first, lesson, {
    accuracy: 80,
    longestStreak: 5,
    rhythmScore: 70,
    keysPerMinute: 120,
    passed: false,
    weakKeys: [],
  }, '2026-09-08T01:00:00.000Z');
  assert.equal(second.lessons['home-row']?.completed, true);
  assert.equal(second.lessons['home-row']?.bestAccuracy, 96);
  assert.equal(second.lessons['home-row']?.attempts, 2);
});
