import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resultShareCaption, resultShareFileName } from './share-card.ts';

describe('Result sharing', () => {
  const result = {
    wpm: 72.4,
    accuracy: 98.25,
    mode: 'ranked',
    handle: 'QuickFox',
    opponentHandle: 'SteadyHands',
    host: 'www.typerival.com',
  };

  it('builds a social caption around WPM and accuracy', () => {
    assert.equal(resultShareCaption(result), '72 WPM at 98.3% accuracy against SteadyHands on TypeRival. Think you can beat it? https://typerival.com');
  });

  it('builds a safe, recognizable PNG name', () => {
    assert.equal(resultShareFileName(result), 'typerival-ranked-72-wpm.png');
  });
});
