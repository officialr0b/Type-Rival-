import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STENO_KEY_ROWS,
  STENO_LESSONS,
  calculateStenoSummary,
  emptyStenoProgress,
  firstIncompleteStenoStage,
  normalizeStenoText,
  parseStenoProgress,
  recordStenoStage,
} from './steno-academy.ts';

test('provides a six-lesson, eighteen-stage stenography curriculum', () => {
  assert.equal(STENO_LESSONS.length, 6);
  assert.equal(STENO_LESSONS.flatMap((lesson) => lesson.stages).length, 18);
  assert.deepEqual(STENO_KEY_ROWS[2], ['A', 'O', 'E', 'U']);
  assert.equal(new Set(STENO_LESSONS.map((lesson) => lesson.id)).size, 6);

  for (const lesson of STENO_LESSONS) {
    assert.equal(lesson.setupChecks.length, 3, `${lesson.id} needs three writer checks`);
    assert.ok(lesson.knowledge.length >= 3, `${lesson.id} needs field guidance`);
    assert.deepEqual(lesson.stages.map((stage) => stage.id), ['learn', 'build', 'master']);
    for (const stage of lesson.stages) {
      const words = normalizeStenoText(stage.drill).split(' ').filter(Boolean);
      assert.ok(words.length >= stage.passCleanWords, `${lesson.id}/${stage.id} clean-word target is unreachable`);
      assert.ok(stage.passAccuracy >= 90 && stage.passAccuracy <= 100);
    }
  }
});

test('normalizes translated writer output without penalizing a trailing space', () => {
  assert.equal(normalizeStenoText('  “Realtime” isn’t late.  '), '"realtime" isn\'t late.');
});

test('steno summary enforces accuracy and clean-word standards', () => {
  const stage = STENO_LESSONS[0]!.stages[0]!;
  const passed = calculateStenoSummary({
    target: stage.drill,
    input: `${stage.drill} `,
    elapsedMs: 12_000,
    corrections: 1,
    stage,
  });
  assert.equal(passed.passed, true);
  assert.equal(passed.accuracy, 100);
  assert.equal(passed.cleanWords, 2);

  const failed = calculateStenoSummary({
    target: stage.drill,
    input: 'steno wrong',
    elapsedMs: 12_000,
    corrections: 0,
    stage,
  });
  assert.equal(failed.passed, false);
});

test('steno progress requires all three stages and parses defensively', () => {
  assert.deepEqual(parseStenoProgress('{broken'), emptyStenoProgress());
  const lesson = STENO_LESSONS[0]!;
  let progress = emptyStenoProgress();
  for (const stage of lesson.stages) {
    progress = recordStenoStage(progress, lesson, stage, {
      accuracy: 98,
      translatedWpm: 45,
      cleanWords: 20,
      corrections: 0,
      passed: true,
    }, '2026-09-19T00:00:00.000Z');
  }
  assert.equal(progress.totalDrills, 3);
  assert.equal(progress.lessons['writer-ready']?.completed, true);
  assert.equal(firstIncompleteStenoStage(lesson, progress.lessons['writer-ready']), 2);
});
