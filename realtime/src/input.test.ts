import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyLiveEdit, liveMetrics } from './input.js';

describe('live race input', () => {
  it('keeps paste blocked and swipe chunks bounded', () => {
    assert.equal(applyLiveEdit('The ', { inputType: 'insertFromPaste', data: 'coast' }, 20, true), 'The ');
    assert.equal(applyLiveEdit('The ', { inputType: 'insertText', data: 'coast' }, 20, false), 'The ');
    assert.equal(applyLiveEdit('The ', { inputType: 'insertText', data: 'coast' }, 20, true), 'The coast');
  });

  it('scores the state the server accepted', () => {
    const metrics = liveMetrics('clean line', 'clean line', 60_000, 10);
    assert.equal(metrics.wpm, 2);
    assert.equal(metrics.accuracy, 100);
  });
});
