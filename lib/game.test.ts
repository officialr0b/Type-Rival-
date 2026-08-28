import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PASSAGES, applyTypingEdit, calculateMetrics, choosePassage, decideWinner, getPassage, normalizeTypingInput, xpForMode } from './game.ts';
import { updateGlicko2 } from './glicko2.ts';

describe('TypeRival scoring', () => {
  it('calculates a perfect 60 WPM minute', () => {
    const text = 'a'.repeat(300);
    const result = calculateMetrics(text, text, 60_000, 300);
    assert.equal(result.netWpm, 60);
    assert.equal(result.accuracy, 100);
    assert.equal(result.performanceScore, 60);
  });

  it('enforces the accuracy gate', () => {
    const accurate = { accuracy: 96, performanceScore: 55 };
    const messy = { accuracy: 89, performanceScore: 90 };
    assert.equal(decideWinner(accurate, messy), 'a');
  });

  it('awards the intended base XP by mode', () => {
    assert.equal(xpForMode('practice'), 20);
    assert.equal(xpForMode('ranked'), 30);
    assert.equal(xpForMode('friendly'), 10);
    assert.equal(xpForMode('challenge'), 10);
  });

  it('ships a large active rotation with unique passages', () => {
    assert.ok(PASSAGES.length >= 48);
    assert.equal(new Set(PASSAGES.map((passage) => passage.id)).size, PASSAGES.length);
    assert.equal(new Set(PASSAGES.map((passage) => passage.text)).size, PASSAGES.length);
  });

  it('selects the only passage that has not been excluded', () => {
    const expected = PASSAGES.at(-1)!;
    const excluded = PASSAGES.slice(0, -1).map((passage) => passage.id);
    assert.equal(choosePassage(excluded).id, expected.id);
  });

  it('keeps launch passages available only for existing challenge links', () => {
    assert.equal(PASSAGES.some((passage) => passage.id === 'steady-hands'), false);
    assert.equal(getPassage('steady-hands')?.id, 'steady-hands');
  });

  it('normalizes iOS smart punctuation without changing typed content', () => {
    assert.equal(normalizeTypingInput('yesterday\u2019s trail'), "yesterday's trail");
    assert.equal(normalizeTypingInput('\u201cReady\u201d\u00a0now'), '"Ready" now');
  });

  it('builds mobile input from deliberate edits without trusting the textarea caret', () => {
    let value = '';
    for (const character of 'The coast') {
      value = applyTypingEdit(value, 'insertText', character, 20).value;
    }
    assert.equal(value, 'The coast');
    assert.deepEqual(applyTypingEdit(value, 'deleteContentBackward', null, 20), { value: 'The coas', insertedChars: 0 });
  });

  it('blocks iOS replacements and other bulk insertions during a race', () => {
    assert.deepEqual(applyTypingEdit('The', 'insertReplacementText', 'The ', 20), { value: 'The', insertedChars: 0 });
    assert.deepEqual(applyTypingEdit('The', 'insertFromPaste', ' coast', 20), { value: 'The', insertedChars: 0 });
    assert.deepEqual(applyTypingEdit('The', 'insertText', ' coast', 20), { value: 'The', insertedChars: 0 });
  });
});

describe('Glicko-2', () => {
  it('moves the winner up and loser down', () => {
    const player = { rating: 1500, deviation: 200, volatility: 0.06 };
    const winner = updateGlicko2(player, player, 1);
    const loser = updateGlicko2(player, player, 0);
    assert.ok(winner.rating > 1500);
    assert.ok(loser.rating < 1500);
    assert.ok(winner.deviation < 200);
  });
});
