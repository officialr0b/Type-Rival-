import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseAgeBand } from './age.ts';

describe('TypeRival age entry', () => {
  it('accepts only supported age bands from native navigation', () => {
    assert.equal(parseAgeBand('under13'), 'under13');
    assert.equal(parseAgeBand('teen'), 'teen');
    assert.equal(parseAgeBand('adult'), 'adult');
    assert.equal(parseAgeBand('invalid'), null);
    assert.equal(parseAgeBand(undefined), null);
  });

  it('uses the first value when a query parameter repeats', () => {
    assert.equal(parseAgeBand(['teen', 'adult']), 'teen');
  });
});
