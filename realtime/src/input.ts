export type LiveEdit = { inputType: string; data: string | null };

export function applyLiveEdit(current: string, edit: LiveEdit, maxLength: number, allowSwipe: boolean) {
  if (edit.inputType === 'deleteContentBackward' || edit.inputType === 'deleteWordBackward') {
    const characters = Array.from(current);
    characters.pop();
    return characters.join('');
  }
  const allowed = allowSwipe
    ? ['insertText', 'insertFromComposition', 'insertCompositionText', 'insertReplacementText']
    : ['insertText', 'insertFromComposition'];
  if (!allowed.includes(edit.inputType)) return current;
  const characters = Array.from((edit.data ?? '').normalize('NFC').replace(/[\r\n]/g, ''));
  if (characters.length < 1 || characters.length > (allowSwipe ? 48 : 1)) return current;
  const remaining = Math.max(0, maxLength - Array.from(current).length);
  return current + characters.slice(0, remaining).join('');
}

export function liveMetrics(passage: string, input: string, elapsedMs: number, totalTypedChars: number) {
  const expected = Array.from(passage);
  const actual = Array.from(input);
  let correctChars = 0;
  let errors = 0;
  actual.forEach((character, index) => {
    if (character === expected[index]) correctChars += 1;
    else errors += 1;
  });
  const minutes = Math.max(1_000, elapsedMs) / 60_000;
  const accuracy = actual.length === 0 ? 100 : correctChars / actual.length * 100;
  return {
    wpm: Math.max(0, (correctChars / 5 - errors) / minutes),
    accuracy,
    errors,
    totalTypedChars,
  };
}
