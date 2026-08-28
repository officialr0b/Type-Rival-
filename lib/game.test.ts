import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateMetrics, decideWinner, xpForMode } from './game.ts';
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
