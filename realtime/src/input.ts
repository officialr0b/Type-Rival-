export type LiveEdit = { inputType: string; data: string | null; value?: string };

const nativeSwipeInputTypes = new Set([
  '',
  'insertText',
  'insertCompositionText',
  'insertFromComposition',
  'insertReplacementText',
  'deleteContentBackward',
  'deleteContentForward',
  'deleteWordBackward',
  'deleteWordForward',
]);

function normalizeInput(value: string) {
  return value
    .normalize('NFC')
    .replace(/[\u2018\u2019\u02bc\uff07]/g, "'")
    .replace(/[\u201c\u201d\uff02]/g, '"')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/[\r\n\u200b]/g, '');
}

function reconcileLiveValue(current: string, value: string, maxLength: number) {
  const previous = Array.from(normalizeInput(current));
  const next = Array.from(normalizeInput(value)).slice(0, maxLength);
  let prefix = 0;
  while (prefix < previous.length && prefix < next.length && previous[prefix] === next[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < previous.length - prefix
    && suffix < next.length - prefix
    && previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) suffix += 1;
  const removed = previous.length - prefix - suffix;
  const inserted = next.length - prefix - suffix;
  return Math.max(removed, inserted) <= 48 ? next.join('') : current;
}

export function applyLiveEdit(current: string, edit: LiveEdit, maxLength: number, allowSwipe: boolean) {
  if (allowSwipe && typeof edit.value === 'string') {
    if (!nativeSwipeInputTypes.has(edit.inputType)) return current;
    return reconcileLiveValue(current, edit.value, maxLength);
  }
  if (edit.inputType === 'deleteContentBackward' || edit.inputType === 'deleteWordBackward') {
    const characters = Array.from(current);
    characters.pop();
    return characters.join('');
  }
  const allowed = allowSwipe
    ? ['', 'insertText', 'insertFromComposition', 'insertCompositionText', 'insertReplacementText']
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
