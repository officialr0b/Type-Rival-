import { progressionForXp, type Progression } from './progression.ts';

export type JuniorLocalProfile = {
  totalXp: number;
  totalRuns: number;
};

export const EMPTY_JUNIOR_PROFILE: JuniorLocalProfile = {
  totalXp: 0,
  totalRuns: 0,
};

export function parseJuniorLocalProfile(value: unknown): JuniorLocalProfile {
  if (!value || typeof value !== 'object') return EMPTY_JUNIOR_PROFILE;
  const candidate = value as Partial<JuniorLocalProfile>;
  return {
    totalXp: safeWholeNumber(candidate.totalXp),
    totalRuns: safeWholeNumber(candidate.totalRuns),
  };
}

export function awardJuniorPracticeRun(
  profile: JuniorLocalProfile,
  xpEarned: number,
): JuniorLocalProfile {
  return {
    totalXp: safeWholeNumber(profile.totalXp) + safeWholeNumber(xpEarned),
    totalRuns: safeWholeNumber(profile.totalRuns) + 1,
  };
}

export function juniorProgression(totalXp: number): Progression {
  const level = progressionForXp(totalXp);
  return {
    totalXp: level.totalXp,
    level,
    missions: [],
    missionBonusXp: 0,
    newlyCompleted: [],
  };
}

function safeWholeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}
