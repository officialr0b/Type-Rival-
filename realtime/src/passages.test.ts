import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LIVE_PASSAGES, isLiveTypingLanguage, livePassage } from './passages.js';

describe('private race passages', () => {
  it('locks a deterministic passage to every supported language', () => {
    for (const language of Object.keys(LIVE_PASSAGES)) {
      assert.equal(isLiveTypingLanguage(language), true);
      const first = livePassage('room-123', language);
      const second = livePassage('room-123', language);
      assert.deepEqual(first, second);
      assert.equal(first.language, language);
      assert.ok(first.text.length > 150);
    }
  });

  it('falls back to US English for untrusted room options', () => {
    assert.equal(livePassage('room-123', 'not-a-language').language, 'en');
  });
});
