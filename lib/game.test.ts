import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PASSAGES, PASSAGE_CATEGORIES, SUPPORTED_LANGUAGES, applyTypingEdit, calculateMetrics, choosePassage, decideWinner, detectDeviceClass, getPassage, isCustomPassage, normalizeTypingInput, passagesForLanguage, passagesForSelection, physicalKeyEdit, rankedPassageForLanguage, xpForMode } from './game.ts';
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
    assert.ok(PASSAGES.length >= 98);
    assert.equal(new Set(PASSAGES.map((passage) => passage.id)).size, PASSAGES.length);
    assert.equal(new Set(PASSAGES.map((passage) => passage.text)).size, PASSAGES.length);
  });

  it('ships at least ten original passages in every supported language', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const passages = passagesForLanguage(language.code);
      assert.ok(passages.length >= 10, `${language.label} passage library is too small`);
      assert.ok(passages.every((passage) => passage.language === language.code));
    }
  });

  it('selects the only passage that has not been excluded', () => {
    const spanish = passagesForLanguage('es');
    const expected = spanish.at(-1)!;
    const excluded = spanish.slice(0, -1).map((passage) => passage.id);
    assert.equal(choosePassage(excluded, 'es').id, expected.id);
  });

  it('ships at least two reviewed English passages in every learning category', () => {
    for (const category of PASSAGE_CATEGORIES) {
      if (category.code === 'all' || category.code === 'balanced') continue;
      const passages = passagesForSelection('en', category.code);
      assert.ok(passages.length >= 2, `${category.label} needs more passages`);
      assert.ok(passages.every((passage) => passage.category === category.code));
      assert.ok(passages.every((passage) => passage.learning?.sourceUrl.startsWith('https://')));
    }
  });

  it('keeps category selection inside the requested subject', () => {
    assert.equal(choosePassage([], 'en', 'science').category, 'science');
    assert.equal(choosePassage([], 'en', 'history').category, 'history');
  });

  it('recognizes custom passages without adding them to the reviewed library', () => {
    assert.equal(isCustomPassage({ id: 'custom-one', text: 'example', category: 'science', language: 'en', sourceType: 'custom' }), true);
    assert.equal(PASSAGES.some((passage) => passage.id.startsWith('custom-')), false);
  });

  it('schedules one stable ranked passage per language and time window', () => {
    const timestamp = Date.UTC(2026, 8, 3, 18, 0, 0);
    assert.equal(rankedPassageForLanguage('fr', timestamp), rankedPassageForLanguage('fr', timestamp + 899_999));
    assert.equal(rankedPassageForLanguage('fr', timestamp).language, 'fr');
    assert.equal(rankedPassageForLanguage('es', timestamp).language, 'es');
  });

  it('keeps launch passages available only for existing challenge links', () => {
    assert.equal(PASSAGES.some((passage) => passage.id === 'steady-hands'), false);
    assert.equal(getPassage('steady-hands')?.id, 'steady-hands');
  });

  it('normalizes iOS smart punctuation without changing typed content', () => {
    assert.equal(normalizeTypingInput('yesterday\u2019s trail'), "yesterday's trail");
    assert.equal(normalizeTypingInput('\u201cReady\u201d\u00a0now'), '"Ready" now');
    assert.equal(normalizeTypingInput('cafe\u0301'), 'café');
  });

  it('accepts one composed accented character without opening bulk input', () => {
    assert.deepEqual(applyTypingEdit('caf', 'insertText', 'e\u0301', 20), { value: 'café', insertedChars: 1 });
    assert.deepEqual(applyTypingEdit('fran', 'insertFromComposition', 'ç', 20), { value: 'franç', insertedChars: 1 });
    assert.equal(calculateMetrics('café', 'cafe\u0301', 60_000, 4).accuracy, 100);
  });

  it('builds mobile input from deliberate edits without trusting the textarea caret', () => {
    let value = '';
    for (const character of 'The coast') {
      value = applyTypingEdit(value, 'insertText', character, 20).value;
    }
    assert.equal(value, 'The coast');
    assert.deepEqual(applyTypingEdit(value, 'deleteContentBackward', null, 20), { value: 'The coas', insertedChars: 0 });
  });

  it('allows corrections when a mode enables backspace', () => {
    assert.deepEqual(applyTypingEdit('mistkae', 'deleteContentBackward', null, 20, true), { value: 'mistka', insertedChars: 0 });
    assert.deepEqual(applyTypingEdit('mistkae', 'deleteContentBackward', null, 20, false), { value: 'mistkae', insertedChars: 0 });
  });

  it('separates phone and tablet runs from desktop runs', () => {
    assert.equal(detectDeviceClass({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' }), 'mobile');
    assert.equal(detectDeviceClass({ userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9)' }), 'mobile');
    assert.equal(detectDeviceClass({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', platform: 'MacIntel', maxTouchPoints: 5 }), 'mobile');
    assert.equal(detectDeviceClass({ mobileHint: false, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }), 'desktop');
  });

  it('translates iPad hardware keyboard keys into race edits', () => {
    assert.deepEqual(physicalKeyEdit('T'), { inputType: 'insertText', data: 'T' });
    assert.deepEqual(physicalKeyEdit(' '), { inputType: 'insertText', data: ' ' });
    assert.deepEqual(physicalKeyEdit('Backspace'), { inputType: 'deleteContentBackward', data: null });
    assert.equal(physicalKeyEdit('v', { metaKey: true }), null);
    assert.equal(physicalKeyEdit('Shift'), null);
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
