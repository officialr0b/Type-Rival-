export type GameMode = 'practice' | 'friendly' | 'ranked' | 'challenge';

export type Passage = {
  id: string;
  text: string;
  category: 'balanced';
};

export type TypingMetrics = {
  correctChars: number;
  incorrectChars: number;
  grossWpm: number;
  netWpm: number;
  accuracy: number;
  performanceScore: number;
};

export const PASSAGES: Passage[] = [
  {
    id: 'steady-hands',
    category: 'balanced',
    text: 'Speed grows from steady hands. Stay relaxed, trust the rhythm, and let each word arrive before you chase the next one. Clean inputs will carry you farther than a frantic start.',
  },
  {
    id: 'city-lights',
    category: 'balanced',
    text: 'City lights flickered across the glass as the late train curved toward the river. Every stop brought a new voice, a quick laugh, and another story moving through the night.',
  },
  {
    id: 'morning-market',
    category: 'balanced',
    text: 'At sunrise, the market opened with bright fruit, rolling carts, and handwritten signs. Neighbors traded recipes while vendors called out the best finds of the morning.',
  },
  {
    id: 'small-signal',
    category: 'balanced',
    text: 'A small signal can cross a great distance when the message is clear. Precision gives speed a purpose, and practice turns a difficult motion into quiet instinct.',
  },
  {
    id: 'open-water',
    category: 'balanced',
    text: 'Beyond the harbor, the water opened into long blue lines. The crew checked every rope twice, watched the wind, and kept a steady course toward the pale horizon.',
  },
  {
    id: 'night-shift',
    category: 'balanced',
    text: 'The night shift learned to listen for the smallest change. A quiet click, a brighter light, or a number out of place could reveal the answer before anyone asked.',
  },
];

export function getPassage(id: string): Passage | undefined {
  return PASSAGES.find((passage) => passage.id === id);
}

export function choosePassage(previousId?: string): Passage {
  const pool = PASSAGES.filter((passage) => passage.id !== previousId);
  return pool[Math.floor(Math.random() * pool.length)] ?? PASSAGES[0]!;
}

export function calculateMetrics(
  passage: string,
  input: string,
  elapsedMs: number,
  totalTypedChars = input.length,
): TypingMetrics {
  let correctChars = 0;
  let incorrectChars = 0;

  for (let index = 0; index < input.length; index += 1) {
    if (input[index] === passage[index]) correctChars += 1;
    else incorrectChars += 1;
  }

  const minutes = Math.max(elapsedMs, 1_000) / 60_000;
  const grossWpm = totalTypedChars / 5 / minutes;
  const netWpm = Math.max(0, (correctChars / 5 - incorrectChars) / minutes);
  const attempts = correctChars + incorrectChars;
  const accuracy = attempts === 0 ? 100 : (correctChars / attempts) * 100;
  const accuracyFactor = clamp((accuracy / 100 - 0.8) / 0.18, 0, 1);
  const performanceScore = netWpm * (0.7 + 0.3 * accuracyFactor);

  return {
    correctChars,
    incorrectChars,
    grossWpm: round(grossWpm),
    netWpm: round(netWpm),
    accuracy: round(accuracy),
    performanceScore: round(performanceScore),
  };
}

export function decideWinner(
  a: Pick<TypingMetrics, 'accuracy' | 'performanceScore'>,
  b: Pick<TypingMetrics, 'accuracy' | 'performanceScore'>,
): 'a' | 'b' | 'draw' {
  const aClearsGate = a.accuracy >= 90;
  const bClearsGate = b.accuracy >= 90;
  if (aClearsGate !== bClearsGate) return aClearsGate ? 'a' : 'b';
  if (a.performanceScore !== b.performanceScore) return a.performanceScore > b.performanceScore ? 'a' : 'b';
  if (a.accuracy !== b.accuracy) return a.accuracy > b.accuracy ? 'a' : 'b';
  return 'draw';
}

export function xpForMode(mode: GameMode): number {
  if (mode === 'ranked') return 30;
  if (mode === 'friendly' || mode === 'challenge') return 10;
  return 20;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
