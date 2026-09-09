import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyLiveEdit, decideLiveWinner, insertedCharacters, liveMetrics } from './input.js';

describe('live race input', () => {
  it('keeps paste blocked and swipe chunks bounded', () => {
    assert.equal(applyLiveEdit('The ', { inputType: 'insertFromPaste', data: 'coast' }, 20, true), 'The ');
    assert.equal(applyLiveEdit('The ', { inputType: 'insertText', data: 'coast' }, 20, false), 'The ');
    assert.equal(applyLiveEdit('The ', { inputType: 'insertText', data: 'coast' }, 20, true), 'The coast');
  });

  it('accepts native swipe snapshots and replaces evolving iOS candidates', () => {
    let value = applyLiveEdit('', { inputType: 'insertCompositionText', data: 'Improving', value: 'Improving' }, 80, true);
    value = applyLiveEdit(value, { inputType: 'insertReplacementText', data: 'ement ', value: 'Improvement ' }, 80, true);
    value = applyLiveEdit(value, { inputType: 'insertText', data: 'builds', value: 'Improvement builds' }, 80, true);
    assert.equal(value, 'Improvement builds');
  });

  it('rejects snapshot paste events, oversized jumps, and snapshots from tap players', () => {
    assert.equal(applyLiveEdit('The ', { inputType: 'insertFromPaste', data: 'coast', value: 'The coast' }, 80, true), 'The ');
    assert.equal(applyLiveEdit('The ', { inputType: 'insertText', data: 'coast', value: 'The coast' }, 80, false), 'The ');
    assert.equal(applyLiveEdit('safe', { inputType: 'insertText', data: 'x'.repeat(49), value: `safe${'x'.repeat(49)}` }, 80, true), 'safe');
  });

  it('accepts vendor suggestion events while keeping non-typing shortcuts blocked', () => {
    assert.equal(applyLiveEdit('The ', { inputType: 'insertFromVendorSuggestion', data: 'coast', value: 'The coast' }, 80, true), 'The coast');
    assert.equal(applyLiveEdit('The ', { inputType: 'insertFromDrop', data: 'coast', value: 'The coast' }, 80, true), 'The ');
    assert.equal(applyLiveEdit('The ', { inputType: 'insertFromDictation', data: 'coast', value: 'The coast' }, 80, true), 'The ');
    assert.equal(applyLiveEdit('The ', { inputType: 'historyUndo', data: null, value: '' }, 80, true), 'The ');
  });

  it('scores the state the server accepted', () => {
    const metrics = liveMetrics('clean line', 'clean line', 60_000, 10);
    assert.equal(metrics.wpm, 2);
    assert.equal(metrics.accuracy, 100);
  });

  it('counts inserted characters through corrections without rewarding deletions', () => {
    assert.equal(insertedCharacters('rce', 'race'), 1);
    assert.equal(insertedCharacters('race', 'rac'), 0);
    assert.equal(insertedCharacters('quick path', 'quick race'), 4);
  });

  it('uses the accuracy gate before performance and still breaks sub-gate ties fairly', () => {
    assert.equal(decideLiveWinner(
      { accuracy: 91, performanceScore: 20 },
      { accuracy: 89, performanceScore: 80 },
    ), 'a');
    assert.equal(decideLiveWinner(
      { accuracy: 85, performanceScore: 30 },
      { accuracy: 85, performanceScore: 20 },
    ), 'a');
    assert.equal(decideLiveWinner(
      { accuracy: 98, performanceScore: 55 },
      { accuracy: 98, performanceScore: 55 },
    ), 'draw');
  });
});
