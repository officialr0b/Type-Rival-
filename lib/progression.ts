export type LevelDefinition = {
  level: number;
  name: string;
  minXp: number;
};

export type LevelProgress = LevelDefinition & {
  totalXp: number;
  nextLevel: LevelDefinition | null;
  xpIntoLevel: number;
  xpForNextLevel: number;
  percent: number;
};

export type MissionCadence = 'daily' | 'weekly';
export type MissionKey = 'daily-clean-hands' | 'daily-field-study' | 'weekly-open-challenge';

export type MissionDefinition = {
  key: MissionKey;
  cadence: MissionCadence;
  title: string;
  description: string;
  target: number;
  xpReward: number;
};

export type MissionProgress = MissionDefinition & {
  progress: number;
  completed: boolean;
  claimed: boolean;
  periodStart: string;
  resetAt: string;
};

export type Progression = {
  totalXp: number;
  level: LevelProgress;
  missions: MissionProgress[];
  missionBonusXp: number;
  newlyCompleted: MissionKey[];
};

export const LEVELS: readonly LevelDefinition[] = [
  { level: 1, name: 'Rookie', minXp: 0 },
  { level: 2, name: 'Starter', minXp: 100 },
  { level: 3, name: 'Builder', minXp: 250 },
  { level: 4, name: 'Strider', minXp: 450 },
  { level: 5, name: 'Challenger', minXp: 700 },
  { level: 6, name: 'Contender', minXp: 1_000 },
  { level: 7, name: 'Pace Setter', minXp: 1_350 },
  { level: 8, name: 'Precision', minXp: 1_750 },
  { level: 9, name: 'Front Runner', minXp: 2_200 },
  { level: 10, name: 'Elite Rival', minXp: 2_750 },
] as const;

export const MISSION_DEFINITIONS: readonly MissionDefinition[] = [
  {
    key: 'daily-clean-hands',
    cadence: 'daily',
    title: 'Clean Hands',
    description: 'Finish 3 verified Practice runs at 92% accuracy or better.',
    target: 3,
    xpReward: 40,
  },
  {
    key: 'daily-field-study',
    cadence: 'daily',
    title: 'Field Study',
    description: 'Practice in 2 different learning categories.',
    target: 2,
    xpReward: 30,
  },
  {
    key: 'weekly-open-challenge',
    cadence: 'weekly',
    title: 'Open Challenge',
    description: 'Complete 1 verified Challenge Link run.',
    target: 1,
    xpReward: 75,
  },
] as const;

export function progressionForXp(value: number): LevelProgress {
  const totalXp = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  let current = LEVELS[0];
  for (const level of LEVELS) {
    if (level.minXp > totalXp) break;
    current = level;
  }
  const nextLevel = LEVELS.find((level) => level.level === current.level + 1) ?? null;
  const xpIntoLevel = totalXp - current.minXp;
  const xpForNextLevel = nextLevel ? nextLevel.minXp - current.minXp : 0;
  return {
    ...current,
    totalXp,
    nextLevel,
    xpIntoLevel,
    xpForNextLevel,
    percent: nextLevel ? Math.min(100, xpIntoLevel / xpForNextLevel * 100) : 100,
  };
}

export function utcMissionPeriod(now: Date, cadence: MissionCadence) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (cadence === 'weekly') {
    const daysSinceMonday = (start.getUTCDay() + 6) % 7;
    start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  }
  const resetAt = new Date(start);
  resetAt.setUTCDate(resetAt.getUTCDate() + (cadence === 'weekly' ? 7 : 1));
  return {
    periodStart: start.toISOString().slice(0, 10),
    startIso: start.toISOString(),
    resetAt: resetAt.toISOString(),
  };
}

export function journeyAround(level: number, radius = 2): readonly LevelDefinition[] {
  const currentIndex = Math.max(0, LEVELS.findIndex((candidate) => candidate.level === level));
  let start = Math.max(0, currentIndex - radius);
  const size = Math.min(LEVELS.length, radius * 2 + 1);
  start = Math.min(start, LEVELS.length - size);
  return LEVELS.slice(start, start + size);
}
