export const LIVE_PASSAGES = [
  'A steady rhythm turns quick reactions into reliable speed. Keep your hands relaxed, read one phrase ahead, and let accuracy build the pace.',
  'The city train crossed the river as evening lights appeared along the shore. Inside, two rivals watched the countdown and waited for the same first word.',
  'Good competition makes practice feel urgent without making it careless. The fastest result is still the one that reaches the finish cleanly.',
  'A small signal can travel a great distance when every part of the message is clear. Precision gives speed a purpose and practice makes it repeatable.',
  'Morning rain covered the windows while the workshop came alive. Tools clicked, radios hummed, and a careful plan turned a difficult repair into progress.',
  'The trail climbed above the trees and opened toward a wide blue horizon. Each step felt lighter once the group found a pace they could hold together.',
] as const;

export function livePassage(roomId: string) {
  let hash = 0;
  for (const character of roomId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return LIVE_PASSAGES[hash % LIVE_PASSAGES.length];
}
