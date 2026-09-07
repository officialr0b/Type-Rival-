'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import AuthModal from './auth-modal';
import { InputDiagnosticOverlay, clearInputDiagnostics, recordInputDiagnostic } from './input-diagnostics';
import LiveFriendly from './live-friendly';
import PassageStudio from './passage-studio';
import {
  DEFAULT_LANGUAGE,
  PASSAGES,
  PASSAGE_CATEGORIES,
  SUPPORTED_LANGUAGES,
  applyTypingEdit,
  calculateMetrics,
  choosePassage,
  detectDeviceClass,
  emptyInputTelemetry,
  getPassage,
  inputMethodFromTelemetry,
  isCustomPassage,
  isNativeSwipeInputType,
  isPassageCategory,
  isTypingLanguage,
  passagesForLanguage,
  passagesForSelection,
  physicalKeyEdit,
  rankedPassageForLanguage,
  reconcileTypingValue,
  type GameMode,
  type DeviceClass,
  type InputMethod,
  type InputTelemetry,
  type MobileInputPreference,
  type Passage,
  type PassageCategory,
  type PassageCategorySelection,
  type TypingLanguage,
  type TypingMetrics,
} from '../lib/game';
import { parseAgeBand, type AgeBand } from '../lib/age';
import {
  buildPracticeCoachingReport,
  createCoachingRun,
  emptyTypingProfile,
  type CoachingRun,
  type PracticeCoachingReport,
  type TypingProfile,
} from '../lib/result-coaching';
import {
  createResultShareFile,
  resultShareCaption,
} from '../lib/share-card';
import {
  authFetch,
  configureSupabase,
  getSupabaseBrowserClient,
  type SupabasePublicConfig,
} from '../lib/supabase-browser';
import {
  MISSION_DEFINITIONS,
  journeyAround,
  progressionForXp,
  type MissionProgress,
  type Progression,
} from '../lib/progression';

type Screen = 'home' | 'setup' | 'race' | 'results' | 'leaderboard' | 'account' | 'legal' | 'feedback' | 'passages' | 'live';
type LeaderboardEntry = { handle: string; averageWpm: number; accuracy: number; sessions: number; rating: number };

type Player = {
  signedIn: boolean;
  handle?: string;
  xp?: number;
  rating?: number;
  gamesPlayed?: number;
  wins?: number;
  losses?: number;
  draws?: number;
  doubleXpUntil?: string | null;
};

type Bootstrap = {
  user: Player;
  stats: { sessions: number; averageWpm: number; bestWpm: number; accuracy: number; activeDays: number };
  leaderboard: LeaderboardEntry[];
  openLeaderboards: Record<InputMethod, LeaderboardEntry[]>;
  rankedLeaderboards: Record<InputMethod, LeaderboardEntry[]>;
  latestRanked: { matchStatus: string; outcome?: string; ratingDelta?: number } | null;
  coachingHistory: CoachingRun[];
  progression: Progression | null;
};

type Challenge = {
  code: string;
  creatorHandle: string;
  passageId: string;
  durationSec: number;
  creatorMetrics: { netWpm: number; accuracy: number };
  expiresAt: string;
  passage?: Passage;
};

type LocalRaceResult = {
  passage: Passage;
  mode: GameMode;
  input: string;
  elapsedMs: number;
  totalTypedChars: number;
  metrics: TypingMetrics;
  typingProfile: TypingProfile;
  inputMethod: InputMethod;
  inputTelemetry: InputTelemetry;
};

type RunTicket = {
  runTicketId: string;
  passageId: string;
  language: TypingLanguage;
  durationSec: number;
  issuedAt: string;
  expiresAt: string;
};

type SavedResult = LocalRaceResult & {
  xpEarned: number;
  missionBonusXp?: number;
  progression?: Progression | null;
  coachingReport?: PracticeCoachingReport;
  sessionId?: string;
  xpMultiplier?: number;
  saved: boolean;
  riskStatus?: string;
  match?: {
    status: string;
    outcome?: string;
    opponentHandle?: string;
    opponentScore?: number;
    opponentMetrics?: TypingMetrics;
    ratingDelta?: number;
    rating?: number;
    doubleXpUntil?: string | null;
  } | null;
  doubleXpUntil?: string | null;
  challengeUrl?: string;
  challengeOutcome?: 'win' | 'loss' | 'draw';
  creatorMetrics?: TypingMetrics;
  creatorHandle?: string;
  friendlyMatch?: {
    outcome: 'win' | 'loss' | 'draw';
    opponentHandle: string;
    opponentMetrics: TypingMetrics;
    doubleXpUntil?: string | null;
  };
};

type RankedSessionApiResult = {
  error?: string;
  match: NonNullable<SavedResult['match']>;
};

type ChallengeAttemptApiResult = {
  error?: string;
  outcome: 'win' | 'loss' | 'draw';
  creator: TypingMetrics;
  creatorHandle: string;
  saved?: boolean;
  xpEarned: number;
  xpMultiplier: number;
  doubleXpUntil?: string | null;
  missionBonusXp?: number;
  progression?: Progression | null;
};

type ChallengeStatusApiResult = Challenge & {
  latestAttempt?: {
    creatorOutcome: 'win' | 'loss' | 'draw';
    challengerHandle: string;
    challengerMetrics: TypingMetrics;
    doubleXpUntil?: string | null;
  };
};

type SessionApiResult = {
  error?: string;
  metrics: TypingMetrics;
  xpEarned: number;
  xpMultiplier?: number;
  doubleXpUntil?: string | null;
  saved: boolean;
  riskStatus?: string;
  sessionId?: string;
  match?: SavedResult['match'];
  missionBonusXp?: number;
  progression?: Progression | null;
  inputMethod?: InputMethod;
};

type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type PracticeStats = Bootstrap['stats'];

const emptyStats: PracticeStats = { sessions: 0, averageWpm: 0, bestWpm: 0, accuracy: 0, activeDays: 0 };

const defaultBootstrap: Bootstrap = {
  user: { signedIn: false },
  stats: emptyStats,
  leaderboard: [],
  openLeaderboards: { mobile_touch: [], mobile_swipe: [], hardware: [] },
  rankedLeaderboards: { mobile_touch: [], mobile_swipe: [], hardware: [] },
  latestRanked: null,
  coachingHistory: [],
  progression: null,
};

export default function TypeRivalApp({ supabaseConfig, initialAgeBand }: {
  supabaseConfig: SupabasePublicConfig | null;
  initialAgeBand: AgeBand | null;
}) {
  configureSupabase(supabaseConfig);
  const [screen, setScreen] = useState<Screen>('home');
  const [mode, setMode] = useState<GameMode>('practice');
  const [language, setLanguage] = useState<TypingLanguage>(DEFAULT_LANGUAGE);
  const [category, setCategory] = useState<PassageCategorySelection>('all');
  const [durationSec, setDurationSec] = useState(45);
  const [inputPreference, setInputPreference] = useState<MobileInputPreference>('tap');
  const [deviceClass, setDeviceClass] = useState<DeviceClass>('desktop');
  const [liveRoomId, setLiveRoomId] = useState('');
  const [passage, setPassage] = useState<Passage>(() => choosePassage([], DEFAULT_LANGUAGE));
  const [result, setResult] = useState<SavedResult | null>(null);
  const [bootstrap, setBootstrap] = useState<Bootstrap>(defaultBootstrap);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState('');
  const [ageBand, setAgeBand] = useState<AgeBand | null>(initialAgeBand);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [installPrompt, setInstallPrompt] = useState<DeferredInstallPrompt | null>(null);
  const [localStats, setLocalStats] = useState<PracticeStats>(emptyStats);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'update'>('signin');
  const [runTicket, setRunTicket] = useState<RunTicket | null>(null);
  const ageBandRef = useRef<AgeBand | null>(null);
  const languageRef = useRef<TypingLanguage>(DEFAULT_LANGUAGE);
  const closeAuth = useCallback(() => setAuthOpen(false), []);

  const refreshBootstrap = useCallback(async (
    currentAge: AgeBand | null,
    currentLanguage: TypingLanguage = languageRef.current,
  ) => {
    try {
      const query = new URLSearchParams({ language: currentLanguage });
      if (currentAge) query.set('ageBand', currentAge);
      const response = await authFetch(`/api/bootstrap?${query.toString()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('profile unavailable');
      const loaded = await response.json() as Bootstrap & {
        openLeaderboards?: Partial<Record<InputMethod, LeaderboardEntry[]>>;
        rankedLeaderboards?: Partial<Record<InputMethod, LeaderboardEntry[]>> & {
          mobile?: LeaderboardEntry[];
          desktop?: LeaderboardEntry[];
        };
      };
      setBootstrap({
        ...loaded,
        leaderboard: loaded.leaderboard ?? [],
        openLeaderboards: {
          mobile_touch: loaded.openLeaderboards?.mobile_touch ?? [],
          mobile_swipe: loaded.openLeaderboards?.mobile_swipe ?? [],
          hardware: loaded.openLeaderboards?.hardware ?? [],
        },
        rankedLeaderboards: {
          mobile_touch: loaded.rankedLeaderboards?.mobile_touch ?? loaded.rankedLeaderboards?.mobile ?? [],
          mobile_swipe: loaded.rankedLeaderboards?.mobile_swipe ?? [],
          hardware: loaded.rankedLeaderboards?.hardware ?? loaded.rankedLeaderboards?.desktop ?? [],
        },
      });
    } catch {
      setMessage('Online progress is temporarily unavailable. Local practice still works.');
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  useEffect(() => {
    const savedAge = parseAgeBand(window.localStorage.getItem('typerival-age-band'));
    const savedLanguage = readTypingLanguage();
    const validAge = initialAgeBand ?? savedAge;
    const detectedDeviceClass = browserDeviceClass();
    if (initialAgeBand) window.localStorage.setItem('typerival-age-band', initialAgeBand);
    ageBandRef.current = validAge;
    languageRef.current = savedLanguage;
    const client = getSupabaseBrowserClient();
    const initializeTimer = window.setTimeout(() => {
      setDeviceClass(detectedDeviceClass);
      if (validAge) setAgeBand(validAge);
      setLanguage(savedLanguage);
      setPassage((current) => current.language === savedLanguage ? current : choosePassage([], savedLanguage));
      setLocalStats(readLocalStats(savedLanguage));
      // Supabase emits INITIAL_SESSION once its persisted session is ready.
      // Only fall back to a direct load when account services are not configured.
      if (!client) void refreshBootstrap(validAge, savedLanguage);
    }, 0);

    const params = new URLSearchParams(window.location.search);
    const authTimer = window.setTimeout(() => {
      if (params.get('auth') === 'reset') {
        setAuthMode('update');
        setAuthOpen(true);
      } else if (params.get('auth') === 'confirmed') {
        setMessage('Email confirmed. Sign in to start your verified history.');
        setAuthOpen(true);
        window.history.replaceState({}, '', '/');
      }
    }, 0);
    const challengeCode = params.get('challenge');
    if (challengeCode) {
      authFetch(`/api/challenges/${encodeURIComponent(challengeCode)}`)
        .then(async (response) => {
          if (!response.ok) throw new Error('not found');
          return response.json() as Promise<Challenge>;
        })
        .then((loaded) => {
          const targetPassage = loaded.passage ?? getPassage(loaded.passageId);
          if (!targetPassage) throw new Error('passage unavailable');
          setChallenge(loaded);
          setPassage(targetPassage);
          setLanguage(targetPassage.language);
          languageRef.current = targetPassage.language;
          setDurationSec(loaded.durationSec);
          setCategory(targetPassage.category);
          setMode('challenge');
          setScreen('setup');
        })
        .catch(() => setMessage('That challenge is unavailable or has expired.'));
    }
    const requestedLiveRoom = params.get('live');
    const liveTimer = window.setTimeout(() => {
      if (requestedLiveRoom) {
        setLiveRoomId(requestedLiveRoom);
        setScreen('live');
      }
    }, 0);

    const installHandler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as DeferredInstallPrompt);
    };
    window.addEventListener('beforeinstallprompt', installHandler);
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
        .then((registration) => registration.update());
    }
    if (params.has('age')) {
      params.delete('age');
      const query = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
    }
    const subscription = client?.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setAuthMode('update');
        setAuthOpen(true);
      }
      window.setTimeout(() => void refreshBootstrap(ageBandRef.current, languageRef.current), 0);
    }).data.subscription;
    return () => {
      window.clearTimeout(initializeTimer);
      window.clearTimeout(authTimer);
      window.clearTimeout(liveTimer);
      window.removeEventListener('beforeinstallprompt', installHandler);
      subscription?.unsubscribe();
    };
  }, [initialAgeBand, refreshBootstrap]);

  const openAuth = () => {
    if (!ageBand) {
      setMessage('Choose your age range before creating an account.');
      return;
    }
    if (ageBand === 'under13') {
      setMessage('Players under 13 use private device-only practice in this MVP.');
      return;
    }
    setAuthMode('signin');
    setAuthOpen(true);
  };

  const authenticated = () => {
    setAuthOpen(false);
    setMessage('Signed in. Your eligible results can now be saved.');
    void refreshBootstrap(ageBand, language);
  };

  const signOut = async () => {
    await getSupabaseBrowserClient()?.auth.signOut();
    setBootstrap(defaultBootstrap);
    setMessage('Signed out. Practice results will stay on this device.');
    await refreshBootstrap(ageBand, language);
  };

  const changeLanguage = (nextLanguage: TypingLanguage) => {
    if (nextLanguage === language) return;
    languageRef.current = nextLanguage;
    setLanguage(nextLanguage);
    rememberTypingLanguage(nextLanguage);
    setCategory('all');
    setPassage(mode === 'ranked'
      ? rankedPassageForLanguage(nextLanguage)
      : chooseFreshPassage(undefined, nextLanguage, 'all'));
    setLocalStats(readLocalStats(nextLanguage));
    setRunTicket(null);
    setMessage('Typing language updated. Rankings and coaching now show this language.');
    void refreshBootstrap(ageBandRef.current, nextLanguage);
  };

  const chooseMode = (nextMode: GameMode) => {
    setMessage('');
    if (ageBand === 'under13' && nextMode !== 'practice') {
      setMessage('Junior online competition is coming later. Private practice is ready now.');
      return;
    }
    if ((nextMode === 'ranked' || nextMode === 'friendly') && !bootstrap.user.signedIn) {
      setMessage(nextMode === 'ranked'
        ? 'Sign in to bank a ranked run and receive a rating.'
        : 'Sign in to create a challenge link for a friend.');
      openAuth();
      return;
    }
    setMode(nextMode);
    setCategory('all');
    setDurationSec(nextMode === 'ranked' ? 45 : durationSec);
    const rankedPassage = rankedPassageForLanguage(language);
    setPassage(nextMode === 'ranked' ? rankedPassage : chooseFreshPassage(passage.id, language, 'all'));
    setChallenge(null);
    setRunTicket(null);
    setScreen('setup');
    window.requestAnimationFrame(() => window.scrollTo({ top: 0 }));
  };

  const chooseCategory = (nextCategory: PassageCategorySelection) => {
    setCategory(nextCategory);
    setPassage(chooseFreshPassage(passage.id, language, nextCategory));
    setRunTicket(null);
  };

  const startCuratedCategory = (nextCategory: PassageCategory) => {
    setMode('practice');
    setCategory(nextCategory);
    setPassage(chooseFreshPassage(undefined, language, nextCategory));
    setChallenge(null);
    setRunTicket(null);
    setScreen('setup');
  };

  const startCustomPassage = (customPassage: Passage, nextMode: Extract<GameMode, 'practice' | 'friendly'>) => {
    languageRef.current = customPassage.language;
    setLanguage(customPassage.language);
    rememberTypingLanguage(customPassage.language);
    setMode(nextMode);
    setCategory(customPassage.category);
    setPassage(customPassage);
    setChallenge(null);
    setRunTicket(null);
    setResult(null);
    setScreen('setup');
  };

  const startRace = async () => {
    setMessage('');
    if (!bootstrap.user.signedIn || ageBand === 'under13' || (isCustomPassage(passage) && mode !== 'challenge')) {
      setRunTicket(null);
      setScreen('race');
      return;
    }
    setStarting(true);
    try {
      const response = await authFetch('/api/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode, language, category, passageId: passage.id, durationSec, ageBand, deviceClass: browserDeviceClass(), challengeCode: challenge?.code }),
      });
      const data = await response.json() as RunTicket & { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'The run could not be authorized.');
      const authorizedPassage = getPassage(data.passageId) ?? (data.passageId === passage.id ? passage : undefined);
      if (!authorizedPassage) throw new Error('The authorized passage is unavailable.');
      setPassage(authorizedPassage);
      setDurationSec(data.durationSec);
      setRunTicket(data);
      setScreen('race');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The run could not be started.');
    } finally {
      setStarting(false);
    }
  };

  const armRun = async () => {
    if (!runTicket) return;
    const response = await authFetch(`/api/runs/${encodeURIComponent(runTicket.runTicketId)}`, {
      method: 'PATCH',
    });
    const data = await response.json() as { error?: string; startedAt?: string; expiresAt?: string };
    if (!response.ok) throw new Error(data.error ?? 'The run countdown could not be started.');
    setRunTicket((current) => current ? {
      ...current,
      issuedAt: data.startedAt ?? current.issuedAt,
      expiresAt: data.expiresAt ?? current.expiresAt,
    } : current);
  };

  const completeRace = async (localResult: LocalRaceResult) => {
    const customPassage = isCustomPassage(localResult.passage);
    if (!customPassage) rememberPassage(localResult.passage.id);
    const coachingHistory = bootstrap.user.signedIn && bootstrap.coachingHistory.length > 0
      ? bootstrap.coachingHistory
      : readLocalCoachingHistory(localResult.passage.language);
    const recentInsightKeys = coachingHistory.slice(0, 3).flatMap((run) => run.insightKeys);
    const coachingReport = localResult.mode === 'practice'
      ? buildPracticeCoachingReport({
          passage: localResult.passage.text,
          input: localResult.input,
          metrics: localResult.metrics,
          profile: localResult.typingProfile,
          history: coachingHistory,
          recentInsightKeys,
        })
      : undefined;
    const enrichedResult = { ...localResult, coachingReport };
    if (coachingReport && !customPassage) {
      recordLocalCoachingRun(createCoachingRun({
        passageId: localResult.passage.id,
        totalTypedChars: localResult.totalTypedChars,
        metrics: localResult.metrics,
        profile: localResult.typingProfile,
        insightKeys: coachingReport.insightKeys,
      }));
    }
    setSaving(true);
    setScreen('results');
    setResult({ ...enrichedResult, xpEarned: 0, saved: false });
    if ((!bootstrap.user.signedIn || ageBand === 'under13') && !customPassage) {
      setLocalStats(recordLocalRun(localResult));
    }
    if (ageBand === 'under13') {
      setResult({ ...enrichedResult, xpEarned: customPassage ? 0 : 20, saved: false });
      setSaving(false);
      return;
    }
    try {
      if (customPassage && localResult.mode === 'practice') {
        setResult({ ...enrichedResult, xpEarned: 0, xpMultiplier: 1, saved: false });
        return;
      }
      if (customPassage && localResult.mode === 'friendly') {
        const challengeResponse = await authFetch('/api/challenges', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            customPassage: {
              title: localResult.passage.title,
              text: localResult.passage.text,
              language: localResult.passage.language,
              category: localResult.passage.category,
              sourceName: localResult.passage.learning?.sourceLabel,
              sourceUrl: localResult.passage.learning?.sourceUrl,
            },
            durationSec,
            input: localResult.input,
            elapsedMs: localResult.elapsedMs,
            totalTypedChars: localResult.totalTypedChars,
            ageBand,
          }),
        });
        const challengeData = await challengeResponse.json() as { path?: string; error?: string };
        if (!challengeResponse.ok || !challengeData.path) throw new Error(challengeData.error ?? 'The custom challenge could not be created.');
        setResult({
          ...enrichedResult,
          xpEarned: 0,
          xpMultiplier: 1,
          saved: false,
          challengeUrl: `${window.location.origin}${challengeData.path}`,
        });
        return;
      }
      if (localResult.mode === 'challenge' && challenge) {
        const response = await authFetch(`/api/challenges/${challenge.code}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            input: localResult.input,
            elapsedMs: localResult.elapsedMs,
            totalTypedChars: localResult.totalTypedChars,
            durationSec,
            runTicketId: runTicket?.runTicketId,
            ageBand,
          }),
        });
        const data = await response.json() as ChallengeAttemptApiResult;
        if (!response.ok) throw new Error(data.error ?? 'Challenge failed');
        setResult({
          ...enrichedResult,
          xpEarned: data.xpEarned ?? 10,
          xpMultiplier: data.xpMultiplier ?? 1,
          saved: data.saved ?? bootstrap.user.signedIn,
          challengeOutcome: data.outcome,
          creatorMetrics: data.creator,
          creatorHandle: data.creatorHandle,
          doubleXpUntil: data.doubleXpUntil,
          missionBonusXp: data.missionBonusXp,
          progression: data.progression,
        });
      } else {
        const response = await authFetch('/api/sessions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            mode: localResult.mode,
            passageId: localResult.passage.id,
            input: localResult.input,
            elapsedMs: localResult.elapsedMs,
            totalTypedChars: localResult.totalTypedChars,
            durationSec,
            runTicketId: runTicket?.runTicketId,
            ageBand,
            typingProfile: localResult.typingProfile,
            inputTelemetry: localResult.inputTelemetry,
            coachingInsightKeys: coachingReport?.insightKeys,
          }),
        });
        const data = await response.json() as SessionApiResult;
        if (!response.ok) throw new Error(data.error ?? 'Run failed');
        let challengeUrl: string | undefined;
        if (localResult.mode === 'friendly') {
          const challengeResponse = await authFetch('/api/challenges', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              passageId: localResult.passage.id,
              sessionId: data.sessionId,
              durationSec,
              input: localResult.input,
              elapsedMs: localResult.elapsedMs,
              totalTypedChars: localResult.totalTypedChars,
              ageBand,
            }),
          });
          const challengeData = await challengeResponse.json() as { path?: string; error?: string };
          if (challengeResponse.ok && challengeData.path) challengeUrl = `${window.location.origin}${challengeData.path}`;
        }
        setResult({ ...enrichedResult, ...data, challengeUrl });
        if (data.saved) void refreshBootstrap(ageBand, language);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The result could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const runAgain = () => {
    if (mode !== 'challenge' && !isCustomPassage(passage)) {
      setPassage((current) => chooseFreshPassage(current.id, current.language, category));
    }
    setResult(null);
    setRunTicket(null);
    setScreen('setup');
  };

  const applyRankedMatch = useCallback((match: NonNullable<SavedResult['match']>) => {
    setResult((current) => current ? { ...current, match } : current);
    void refreshBootstrap(ageBandRef.current, languageRef.current);
  }, [refreshBootstrap]);

  const applyFriendlyMatch = useCallback((friendlyMatch: NonNullable<SavedResult['friendlyMatch']>) => {
    setResult((current) => current ? {
      ...current,
      friendlyMatch,
      doubleXpUntil: friendlyMatch.doubleXpUntil ?? current.doubleXpUntil,
    } : current);
    void refreshBootstrap(ageBandRef.current, languageRef.current);
  }, [refreshBootstrap]);

  const saveAge = async (nextAge: AgeBand) => {
    window.localStorage.setItem('typerival-age-band', nextAge);
    ageBandRef.current = nextAge;
    setAgeBand(nextAge);
    if (nextAge === 'under13') await getSupabaseBrowserClient()?.auth.signOut();
    await refreshBootstrap(nextAge, language);
  };

  const install = async () => {
    if (!installPrompt) {
      setMessage('Use your browser menu and choose “Add to Home Screen” to install TypeRival.');
      return;
    }
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const openPassageStudio = () => {
    setScreen('passages');
    window.requestAnimationFrame(() => window.scrollTo({ top: 0 }));
  };

  const openLiveFriendly = () => {
    if (ageBand === 'under13') {
      setMessage('Live Friendly is available for players 13 and older. Private practice is ready now.');
      return;
    }
    if (!bootstrap.user.signedIn) {
      setMessage('Sign in to create or join a live room.');
      openAuth();
      return;
    }
    setLiveRoomId('');
    setScreen('live');
    window.requestAnimationFrame(() => window.scrollTo({ top: 0 }));
  };

  const goHome = () => {
    const preferredLanguage = readTypingLanguage();
    if (preferredLanguage !== language) {
      languageRef.current = preferredLanguage;
      setLanguage(preferredLanguage);
      setPassage(chooseFreshPassage(undefined, preferredLanguage, 'all'));
      setLocalStats(readLocalStats(preferredLanguage));
      void refreshBootstrap(ageBandRef.current, preferredLanguage);
    }
    setScreen('home');
    setMode('practice');
    setCategory('all');
    setChallenge(null);
    setResult(null);
    setRunTicket(null);
    window.history.replaceState({}, '', '/');
    window.requestAnimationFrame(() => window.scrollTo({ top: 0 }));
  };

  return (
    <>
      <Header
        player={bootstrap.user}
        progression={bootstrap.progression}
        loading={loadingProfile}
        onHome={goHome}
        onLeaderboard={() => setScreen('leaderboard')}
        onInstall={install}
        onAccount={() => setScreen('account')}
        onSignIn={openAuth}
        onSignOut={() => void signOut()}
      />

      {message && <div className="toast" role="status"><span>◇</span>{message}<button onClick={() => setMessage('')} aria-label="Dismiss">×</button></div>}

      {screen === 'home' && (
        <Home
          bootstrap={bootstrap}
          localStats={localStats}
          ageBand={ageBand}
          language={language}
          onLanguage={changeLanguage}
          onMode={chooseMode}
          onLive={openLiveFriendly}
          onPassageStudio={openPassageStudio}
          onLeaderboard={() => setScreen('leaderboard')}
          onSignIn={openAuth}
        />
      )}

      {screen === 'setup' && (
        <Setup
          mode={mode}
          durationSec={durationSec}
          challenge={challenge}
          language={language}
          category={category}
          passage={passage}
          inputPreference={inputPreference}
          mobileViewer={deviceClass === 'mobile'}
          onLanguage={changeLanguage}
          onCategory={chooseCategory}
          onDuration={setDurationSec}
          onInputPreference={setInputPreference}
          onBack={goHome}
          onStart={() => void startRace()}
          starting={starting}
        />
      )}

      {screen === 'race' && (
        <RaceView
          key={`${mode}-${passage.id}-${durationSec}`}
          mode={mode}
          durationSec={durationSec}
          passage={passage}
          inputPreference={inputPreference}
          onArm={armRun}
          onCancel={() => setScreen('setup')}
          onComplete={completeRace}
        />
      )}

      {screen === 'results' && result && (
        <Results
          result={result}
          saving={saving}
          signedIn={bootstrap.user.signedIn}
          playerHandle={bootstrap.user.handle}
          message={message}
          onRankedMatch={applyRankedMatch}
          onFriendlyMatch={applyFriendlyMatch}
          onAgain={runAgain}
          onHome={goHome}
          onSignIn={openAuth}
        />
      )}

      {screen === 'leaderboard' && <Leaderboard data={bootstrap} language={language} onLanguage={changeLanguage} onBack={goHome} />}
      {screen === 'live' && <LiveFriendly initialRoomId={liveRoomId} inputPreference={inputPreference} mobileViewer={deviceClass === 'mobile'} ageBand={ageBand} signedIn={bootstrap.user.signedIn} onInputPreference={setInputPreference} onBack={goHome} onSignIn={openAuth} />}
      {screen === 'passages' && (
        <PassageStudio
          signedIn={bootstrap.user.signedIn}
          ageBand={ageBand}
          language={language}
          onLanguage={changeLanguage}
          onBack={goHome}
          onCurated={startCuratedCategory}
          onCustom={startCustomPassage}
          onSignIn={openAuth}
        />
      )}
      {screen === 'account' && bootstrap.user.signedIn && (
        <Account
          player={bootstrap.user}
          onBack={goHome}
          onUpdated={() => void refreshBootstrap(ageBand, language)}
          onDeleted={async () => {
            await getSupabaseBrowserClient()?.auth.signOut();
            setBootstrap(defaultBootstrap);
            setScreen('home');
            setMessage('Your TypeRival account and saved data were deleted.');
          }}
        />
      )}
      {screen === 'legal' && <Legal onBack={goHome} />}
      {screen === 'feedback' && <Feedback onBack={goHome} />}

      <footer className="site-footer">
        <span>© 2026 TypeRival</span>
        <span className="footer-links">
          <a href="/terms">Terms</a>
          <a href="/privacy">Privacy</a>
          <a href="/rules">Fair play</a>
          <button onClick={() => setScreen('legal')}>Summary</button>
          <button onClick={() => setScreen('feedback')}>Feedback</button>
        </span>
        <span>Free-to-play MVP · No cash prizes</span>
      </footer>

      {!ageBand && <AgeGate onChoose={saveAge} />}
      {authOpen && (
        <AuthModal
          key={authMode}
          open
          initialMode={authMode}
          onClose={closeAuth}
          onAuthenticated={authenticated}
        />
      )}
      <InputDiagnosticOverlay />
    </>
  );
}

function Header({ player, progression, loading, onHome, onLeaderboard, onInstall, onAccount, onSignIn, onSignOut }: {
  player: Player;
  progression: Progression | null;
  loading: boolean;
  onHome: () => void;
  onLeaderboard: () => void;
  onInstall: () => void;
  onAccount: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
}) {
  return (
    <header className="top-nav">
      <button className="wordmark nav-wordmark" onClick={onHome} aria-label="TypeRival home">
        <span className="wordmark-mark">TR</span><span>TYPE<b>RIVAL</b></span>
      </button>
      <nav aria-label="Primary navigation">
        <button onClick={onLeaderboard}>Leaderboard</button>
        <button onClick={onInstall}>Install</button>
        {player.signedIn ? (
          <>
            <button className="nav-cta" onClick={onAccount}>Account</button>
            <button className="nav-signout" onClick={onSignOut}>Sign out</button>
          </>
        ) : (
          <button className="nav-cta" onClick={onSignIn}>Sign in to save</button>
        )}
      </nav>
      <div className="nav-player" aria-live="polite">
        {player.signedIn && progression
          ? <span className="nav-level" aria-label={`Level ${progression.level.level}`}><small>LV</small><b>{progression.level.level}</b></span>
          : <span className="nav-avatar">{player.handle?.slice(0, 1).toUpperCase() ?? 'R'}</span>}
        <span>
          <small>{loading ? 'LOADING' : player.signedIn && isBoostActive(player.doubleXpUntil) ? `2× XP · ${boostMinutes(player.doubleXpUntil)}M` : player.signedIn && progression ? `${progression.totalXp} XP · RATING ${player.rating}` : player.signedIn ? `RATING ${player.rating}` : 'LOCAL PLAYER'}</small>
          <b>{player.signedIn && progression ? `${progression.level.name} · ${player.handle}` : player.handle ?? 'Guest Rival'}</b>
        </span>
      </div>
    </header>
  );
}

function Home({ bootstrap, localStats, ageBand, language, onLanguage, onMode, onLive, onLeaderboard, onPassageStudio, onSignIn }: {
  bootstrap: Bootstrap;
  localStats: PracticeStats;
  ageBand: AgeBand | null;
  language: TypingLanguage;
  onLanguage: (language: TypingLanguage) => void;
  onMode: (mode: GameMode) => void;
  onLive: () => void;
  onLeaderboard: () => void;
  onPassageStudio: () => void;
  onSignIn: () => void;
}) {
  const stats = bootstrap.user.signedIn && ageBand !== 'under13' ? bootstrap.stats : localStats;
  return (
    <main className="home-page">
      <section className="home-hero">
        <div>
          <span className="eyebrow">COMPETITIVE TYPING, BUILT FOR SPEED</span>
          <h1>Type fast.<br/><i>Stay clean.</i><br/>Own the race.</h1>
          <p>Practice your speed, challenge a friend with one link, or bank a ranked run for a similarly skilled rival.</p>
          <div className="hero-actions">
            <button className="primary-button" onClick={() => onMode('practice')}>START A 45-SECOND RUN</button>
            <button className="text-button" onClick={onLeaderboard}>VIEW 30-DAY BOARD →</button>
          </div>
        </div>
        <div className="hero-scorecard" aria-label="Your 30-day summary">
          <div className="scorecard-head"><span>YOUR 30 DAYS · {languageName(language).toUpperCase()}</span><em>{bootstrap.user.signedIn ? 'SYNCED' : 'LOCAL ONLY'}</em></div>
          <strong>{Math.round(stats.averageWpm || 0)}</strong><small>AVERAGE WPM</small>
          <div className="mini-stats">
            <span><b>{Number(stats.accuracy || 0).toFixed(1)}%</b><small>ACCURACY</small></span>
            <span><b>{Math.round(stats.bestWpm || 0)}</b><small>PERSONAL BEST</small></span>
            <span><b>{stats.sessions || 0}</b><small>RUNS</small></span>
          </div>
          {!bootstrap.user.signedIn && <p>Sign in after your run to start building a verified history.</p>}
        </div>
      </section>

      <ProgressionCommandCenter
        progression={bootstrap.progression}
        eligible={ageBand !== 'under13'}
        onSignIn={onSignIn}
      />

      <section className="modes-section">
        <div className="section-title"><span>CHOOSE YOUR MODE</span><small>{ageBand === 'under13' ? 'JUNIOR PRIVATE PRACTICE' : 'OPEN LADDER · EARLY BETA'}</small></div>
        <LanguageSelector language={language} onLanguage={onLanguage} />
        <div className="launch-mode-grid">
          <LaunchCard number="01" title="Practice" label="LIVE" description="Build speed, accuracy, XP, and your rolling 30-day average." action="PRACTICE NOW" onClick={() => onMode('practice')} featured />
          <LaunchCard number="02" title="Ranked" label="ASYNC BETA" description="Bank one standardized run. We pair it with a rival on the same passage." action="RACE A RIVAL" onClick={() => onMode('ranked')} disabled={ageBand === 'under13'} />
          <LaunchCard number="03" title="Friendly" label="ASYNC" description="Set a score, copy the challenge link, and send it to anyone." action="CREATE A CHALLENGE" onClick={() => onMode('friendly')} disabled={ageBand === 'under13'} />
          <LaunchCard number="04" title="Live Friendly" label="COLYSEUS ALPHA" description="Meet a rival in a private room and race on the same 45-second clock." action="OPEN LIVE ARENA" onClick={onLive} disabled={ageBand === 'under13'} />
          <LaunchCard number="05" title="Passage Studio" label="NEW" description="Choose a subject, learn while you type, or bring your own passage." action="OPEN THE STUDIO" onClick={onPassageStudio} />
        </div>
      </section>

      {bootstrap.latestRanked && (
        <section className="ranked-status">
          <span className="status-light" />
          <p><b>Latest ranked run:</b> {bootstrap.latestRanked.matchStatus === 'matched'
            ? `${bootstrap.latestRanked.outcome?.toUpperCase()} · ${formatDelta(bootstrap.latestRanked.ratingDelta)}`
            : 'Banked and waiting for a compatible rival.'}</p>
        </section>
      )}
    </main>
  );
}

function ProgressionCommandCenter({ progression, eligible, onSignIn }: {
  progression: Progression | null;
  eligible: boolean;
  onSignIn: () => void;
}) {
  if (!progression) {
    const preview = progressionForXp(0);
    return <section className="progression-command progression-guest" aria-labelledby="career-heading">
      <div className="progression-rank">
        <span className="eyebrow">RIVAL CAREER</span>
        <h2 id="career-heading">A reason for every run.</h2>
        <p>{eligible ? 'Earn permanent XP, climb named levels, and complete rotating missions. Your first verified run starts at Rookie.' : 'Career XP and online missions are available with accounts for players 13 and older. Private Practice remains ready on this device.'}</p>
        {eligible && <button className="primary-button" onClick={onSignIn}>SIGN IN TO START AT ROOKIE</button>}
      </div>
      <LevelJourney level={preview} />
      <div className="career-checkpoint">
        <span>THE ROAD AHEAD</span>
        <b>Rookie → Elite Rival</b>
        <p>Ten named checkpoints make your lifetime progress visible. XP never resets and has no cash value.</p>
      </div>
    </section>;
  }

  return <section className="progression-command" aria-labelledby="career-heading">
    <div className="progression-rank">
      <span className="eyebrow">RIVAL CAREER · LIFETIME XP</span>
      <div className="rank-line"><strong>{progression.level.level}</strong><span><small>CURRENT LEVEL</small><h2 id="career-heading">{progression.level.name}</h2></span></div>
      <div className="level-progress-copy">
        <b>{progression.totalXp.toLocaleString()} XP</b>
        <span>{progression.level.nextLevel ? `${progression.level.xpForNextLevel - progression.level.xpIntoLevel} XP TO ${progression.level.nextLevel.name.toUpperCase()}` : 'MAX LEVEL REACHED'}</span>
      </div>
      <ProgressBar value={progression.level.percent} label={`${Math.round(progression.level.percent)}% to the next level`} />
    </div>

    <LevelJourney level={progression.level} />

    <div className="mission-board">
      <header><div><span className="eyebrow">MISSION CONTROL</span><h3>Make today count.</h3></div><small>DAILY 00:00 UTC · WEEKLY MONDAY</small></header>
      <div className="mission-list">
        {progression.missions.map((mission) => <MissionRow key={mission.key} mission={mission} />)}
      </div>
    </div>

    <aside className="career-checkpoint">
      <span>CAREER CHECKPOINT</span>
      <b>{progression.level.name}</b>
      <dl>
        <div><dt>ACTIVE TITLE</dt><dd>{progression.level.name}</dd></div>
        <div><dt>NEXT TITLE</dt><dd>{progression.level.nextLevel?.name ?? 'Career complete'}</dd></div>
        <div><dt>XP RULE</dt><dd>Permanent · never resets</dd></div>
      </dl>
    </aside>
  </section>;
}

function LevelJourney({ level }: { level: Progression['level'] }) {
  return <ol className="level-journey" aria-label="Named level journey">
    {journeyAround(level.level).map((checkpoint) => {
      const state = checkpoint.level < level.level ? 'complete' : checkpoint.level === level.level ? 'current' : 'locked';
      return <li key={checkpoint.level} className={state}>
        <span>{state === 'complete' ? '✓' : checkpoint.level}</span>
        <small>LEVEL {checkpoint.level}</small>
        <b>{checkpoint.name}</b>
      </li>;
    })}
  </ol>;
}

function MissionRow({ mission }: { mission: MissionProgress }) {
  const status = mission.claimed ? 'XP BANKED' : mission.completed ? 'COMPLETE' : `${mission.progress}/${mission.target}`;
  return <article className={`mission-row ${mission.completed ? 'complete' : ''}`}>
    <div className="mission-status"><span>{mission.completed ? '✓' : mission.cadence === 'daily' ? 'D' : 'W'}</span><small>{mission.cadence.toUpperCase()}</small></div>
    <div className="mission-copy"><h4>{mission.title}</h4><p>{mission.description}</p><ProgressBar value={mission.progress / mission.target * 100} label={`${mission.progress} of ${mission.target} complete`} /></div>
    <div className="mission-reward"><b>+{mission.xpReward} XP</b><small>{status}</small></div>
  </article>;
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  return <div className="career-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}><span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

function LanguageSelector({ language, onLanguage, compact = false, disabled = false }: {
  language: TypingLanguage;
  onLanguage: (language: TypingLanguage) => void;
  compact?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className={`language-selector ${compact ? 'compact' : ''}`}>
      <span><small>PLAY LANGUAGE</small><b>{disabled ? 'This passage keeps its original language.' : 'Choose the language you want to type.'}</b></span>
      <select
        aria-label="Typing language"
        value={language}
        disabled={disabled}
        onChange={(event) => {
          if (isTypingLanguage(event.target.value)) onLanguage(event.target.value);
        }}
      >
        {SUPPORTED_LANGUAGES.map((option) => (
          <option key={option.code} value={option.code}>{option.nativeLabel}</option>
        ))}
      </select>
    </label>
  );
}

function LaunchCard({ number, title, label, description, action, onClick, featured, disabled }: {
  number: string; title: string; label: string; description: string; action: string;
  onClick: () => void; featured?: boolean; disabled?: boolean;
}) {
  return (
    <article className={`launch-card ${featured ? 'featured' : ''} ${disabled ? 'disabled' : ''}`}>
      <div className="card-meta"><span>{number}</span><em>{label}</em></div>
      <h2>{title}</h2><p>{description}</p>
      <button className={featured ? 'primary-button' : 'secondary-button'} onClick={onClick} disabled={disabled}>{disabled ? 'COMING FOR JUNIORS' : action}</button>
    </article>
  );
}

function Setup({ mode, durationSec, challenge, language, category, passage, inputPreference, mobileViewer, onLanguage, onCategory, onDuration, onInputPreference, onBack, onStart, starting }: {
  mode: GameMode;
  durationSec: number;
  challenge: Challenge | null;
  language: TypingLanguage;
  category: PassageCategorySelection;
  passage: Passage;
  inputPreference: MobileInputPreference;
  mobileViewer: boolean;
  onLanguage: (language: TypingLanguage) => void;
  onCategory: (category: PassageCategorySelection) => void;
  onDuration: (duration: number) => void;
  onInputPreference: (preference: MobileInputPreference) => void;
  onBack: () => void;
  onStart: () => void;
  starting: boolean;
}) {
  const custom = isCustomPassage(passage);
  const categoryOptions = PASSAGE_CATEGORIES.filter((option) => option.code === 'all'
    || passagesForLanguage(language).some((candidate) => candidate.category === option.code));
  const title = mode === 'ranked' ? 'Bank a ranked run.' : mode === 'friendly' ? 'Set the score to beat.' : mode === 'challenge' ? `${challenge?.creatorHandle ?? 'A rival'} called you out.` : 'Set the clock. Find your flow.';
  return (
    <main className="setup-page game-page">
      <section className="setup-copy">
        <button className="back-button" onClick={onBack}>← BACK</button>
        <span className="eyebrow">{mode.toUpperCase()} MODE</span>
        <h1>{title}</h1>
        <p>{mode === 'ranked'
          ? 'Your server-verified 45-second result will be paired with another signed-in player on the same passage.'
          : mode === 'challenge'
            ? 'Same passage. Same clock. Accuracy wins the tie.'
            : inputPreference === 'swipe'
              ? 'Swipe input accepts word gestures. Paste and drop stay blocked; your keyboard may show suggestions while swipe mode is active.'
              : 'Autocorrect, autocomplete, spellcheck, and paste are disabled where your browser allows it.'}</p>
        <div className="setup-rules">
          <span><b>3</b><small>COUNTDOWN</small></span>
          <span><b>90%</b><small>ACCURACY GATE</small></span>
          <span><b>{mode === 'ranked' ? 'G2' : '0'}</b><small>{mode === 'ranked' ? 'RATING SYSTEM' : 'RATING RISK'}</small></span>
        </div>
      </section>
      <section className="setup-card">
        <LanguageSelector language={language} onLanguage={onLanguage} compact disabled={mode === 'challenge' || custom} />
        {!custom && mode !== 'ranked' && mode !== 'challenge' && <label className="category-selector"><span>PASSAGE SUBJECT</span><select aria-label="Passage subject" value={category} onChange={(event) => { if (event.target.value === 'all' || isPassageCategory(event.target.value)) onCategory(event.target.value); }}>
          {categoryOptions.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
        </select></label>}
        <label>RACE DURATION</label>
        <div className="duration-grid">
          {[30, 45, 60, 120].map((duration) => (
            <button key={duration} className={durationSec === duration ? 'selected' : ''} disabled={mode === 'ranked' || mode === 'challenge'} onClick={() => onDuration(duration)}>
              <b>{duration}</b><small>SEC</small>
            </button>
          ))}
        </div>
        <div className="setup-row"><span><small>PASSAGE</small><b>{custom ? passage.title : `${categoryName(category)} · ${languageName(language)}`}</b></span><em>{custom ? 'UNVERIFIED · 0 XP' : 'READY'}</em></div>
        {mobileViewer ? <div className="input-method-control">
          <span><small>INPUT STYLE</small><b>How do you want to type?</b></span>
          <div role="group" aria-label="Mobile input method">
            <button className={inputPreference === 'tap' ? 'selected' : ''} aria-pressed={inputPreference === 'tap'} onClick={() => onInputPreference('tap')}><b>TAP</b><small>ONE KEY AT A TIME</small></button>
            <button className={inputPreference === 'swipe' ? 'selected' : ''} aria-pressed={inputPreference === 'swipe'} onClick={() => onInputPreference('swipe')}><b>SWIPE</b><small>WORD GESTURES</small></button>
          </div>
          <p>Connected keyboards are detected automatically. Ranked results are placed on the board that matches the input observed during the run.</p>
        </div> : <div className="setup-row"><span><small>INPUT</small><b>Physical keyboard</b></span><em>AUTOMATIC</em></div>}
        <button className="primary-button setup-start" onClick={onStart} disabled={starting}>{starting ? 'AUTHORIZING RUN…' : `START ${durationSec}-SECOND RUN`}</button>
      </section>
    </main>
  );
}

const RACE_INPUT_SENTINEL = '\u200b';

function resetRaceInputField(field: HTMLTextAreaElement) {
  field.value = RACE_INPUT_SENTINEL;
  field.setSelectionRange(RACE_INPUT_SENTINEL.length, RACE_INPUT_SENTINEL.length);
}

function focusRaceInput(field: HTMLTextAreaElement | null) {
  if (!field) return;
  try {
    field.focus({ preventScroll: true });
  } catch {
    field.focus();
  }
}

function keepCharacterInPassageView(container: HTMLElement | null, character: HTMLElement | null) {
  if (!container || !character) return;
  const containerRect = container.getBoundingClientRect();
  const characterRect = character.getBoundingClientRect();
  const topBuffer = Math.min(48, container.clientHeight * 0.2);
  const bottomBuffer = Math.min(72, container.clientHeight * 0.3);

  if (characterRect.top < containerRect.top + topBuffer) {
    container.scrollTop -= containerRect.top + topBuffer - characterRect.top;
  } else if (characterRect.bottom > containerRect.bottom - bottomBuffer) {
    container.scrollTop += characterRect.bottom - (containerRect.bottom - bottomBuffer);
  }
}

function RaceView({ mode, durationSec, passage, inputPreference, onArm, onCancel, onComplete }: {
  mode: GameMode;
  durationSec: number;
  passage: Passage;
  inputPreference: MobileInputPreference;
  onArm: () => Promise<void>;
  onCancel: () => void;
  onComplete: (result: LocalRaceResult) => void;
}) {
  const [armed, setArmed] = useState(false);
  const [arming, setArming] = useState(false);
  const [armError, setArmError] = useState('');
  const [countdown, setCountdown] = useState(3);
  const [active, setActive] = useState(false);
  const [input, setInput] = useState('');
  const [remainingMs, setRemainingMs] = useState(durationSec * 1_000);
  const [totalTypedChars, setTotalTypedChars] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const passageCardRef = useRef<HTMLElement>(null);
  const currentCharacterRef = useRef<HTMLSpanElement>(null);
  const startedAt = useRef(0);
  const finished = useRef(false);
  const activeRef = useRef(false);
  const currentInput = useRef('');
  const currentTotal = useRef(0);
  const lastPhysicalEdit = useRef<{ inputType: string; data: string | null; at: number } | null>(null);
  const typingProfile = useRef<TypingProfile>(emptyTypingProfile());
  const inputTelemetry = useRef<InputTelemetry>(emptyInputTelemetry());
  const lastInsertAt = useRef(0);
  const swipeProfiledLength = useRef(0);

  const elapsedMs = durationSec * 1_000 - remainingMs;
  const passageCharacters = useMemo(() => Array.from(passage.text), [passage.text]);
  const inputCharacters = useMemo(() => Array.from(input), [input]);
  const metrics = useMemo(() => calculateMetrics(passage.text, input, elapsedMs, totalTypedChars), [passage.text, input, elapsedMs, totalTypedChars]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const syncViewportHeight = () => {
      const height = Math.round(viewport?.height ?? window.innerHeight);
      document.documentElement.style.setProperty('--race-viewport-height', `${height}px`);
    };

    syncViewportHeight();
    viewport?.addEventListener('resize', syncViewportHeight);
    viewport?.addEventListener('scroll', syncViewportHeight);
    window.addEventListener('resize', syncViewportHeight);

    return () => {
      viewport?.removeEventListener('resize', syncViewportHeight);
      viewport?.removeEventListener('scroll', syncViewportHeight);
      window.removeEventListener('resize', syncViewportHeight);
      document.documentElement.style.removeProperty('--race-viewport-height');
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    const frame = window.requestAnimationFrame(() => {
      keepCharacterInPassageView(passageCardRef.current, currentCharacterRef.current);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active, input]);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const finish = useCallback((finalInput: string, finalTotal: number, finalElapsed: number) => {
    if (finished.current) return;
    finished.current = true;
    if (inputPreference === 'swipe') {
      const finalCharacters = Array.from(finalInput);
      for (let index = swipeProfiledLength.current; index < finalCharacters.length; index += 1) {
        const actual = finalCharacters[index] ?? '';
        const expected = passageCharacters[index] ?? '';
        if (actual !== expected) {
          typingProfile.current.firstTryErrors += 1;
          if (typingProfile.current.mistakes.length < 24) {
            typingProfile.current.mistakes.push({ expected, actual, index });
          }
        }
      }
      swipeProfiledLength.current = finalCharacters.length;
    }
    const telemetry = { ...inputTelemetry.current };
    onComplete({
      passage,
      mode,
      input: finalInput,
      totalTypedChars: finalTotal,
      elapsedMs: Math.max(1_000, finalElapsed),
      metrics: calculateMetrics(passage.text, finalInput, finalElapsed, finalTotal),
      typingProfile: { ...typingProfile.current, mistakes: [...typingProfile.current.mistakes] },
      inputMethod: inputMethodFromTelemetry(browserDeviceClass(), telemetry),
      inputTelemetry: telemetry,
    });
  }, [inputPreference, mode, onComplete, passage, passageCharacters]);

  const applyRaceEdit = useCallback((inputType: string, data: string | null, source: 'physical' | 'virtual') => {
    if (!activeRef.current || finished.current) return;

    const previousInput = currentInput.current;
    const allowSwipeChunk = source === 'virtual' && inputPreference === 'swipe' && browserDeviceClass() === 'mobile';
    const edit = applyTypingEdit(
      previousInput,
      inputType,
      data,
      passage.text.length + 20,
      true,
      allowSwipeChunk ? 48 : 1,
    );
    if (edit.value === previousInput) return;

    if (source === 'physical') inputTelemetry.current.physicalKeyEvents += 1;
    if (edit.insertedChars === 1) inputTelemetry.current.singleInsertEvents += 1;
    if (edit.insertedChars > 1) inputTelemetry.current.bulkInsertEvents += 1;
    if (inputType === 'insertReplacementText') inputTelemetry.current.replacementEvents += 1;

    if (edit.insertedChars > 0) {
      const now = performance.now();
      const index = Array.from(previousInput).length;
      const inserted = Array.from(edit.value).slice(index);
      inserted.forEach((actual, offset) => {
        const expected = passageCharacters[index + offset] ?? '';
        if (actual !== expected) {
          typingProfile.current.firstTryErrors += 1;
          if (typingProfile.current.mistakes.length < 24) {
            typingProfile.current.mistakes.push({ expected, actual, index: index + offset });
          }
        }
      });
      if (lastInsertAt.current > 0) {
        const pauseMs = now - lastInsertAt.current;
        if (pauseMs >= 900) typingProfile.current.pauseCount += 1;
        if (pauseMs > typingProfile.current.longestPauseMs) {
          typingProfile.current.longestPauseMs = Math.round(pauseMs);
          typingProfile.current.longestPauseIndex = index;
        }
      }
      lastInsertAt.current = now;
    } else if (Array.from(edit.value).length < Array.from(previousInput).length) {
      typingProfile.current.corrections += 1;
    }

    const nextTotal = currentTotal.current + edit.insertedChars;
    currentInput.current = edit.value;
    currentTotal.current = nextTotal;
    setInput(edit.value);
    setTotalTypedChars(nextTotal);
    if (edit.value === passage.text) {
      finish(edit.value, nextTotal, Date.now() - startedAt.current);
    }
  }, [finish, inputPreference, passage.text, passageCharacters]);

  const applySwipeValue = useCallback((nativeValue: string, inputType: string, isComposing: boolean) => {
    if (!activeRef.current || finished.current || !isNativeSwipeInputType(inputType)) return;

    const previousInput = currentInput.current;
    const edit = reconcileTypingValue(previousInput, nativeValue, passage.text.length + 20);
    if (edit.value === previousInput) return;

    const insertedSpan = Array.from(edit.insertedText).length;
    if (edit.insertedChars === 1 && insertedSpan === 1) inputTelemetry.current.singleInsertEvents += 1;
    if (edit.insertedChars > 1 || insertedSpan > 1) inputTelemetry.current.bulkInsertEvents += 1;
    if (edit.removedChars > 0 || inputType === 'insertReplacementText' || inputType === 'insertCompositionText') {
      inputTelemetry.current.replacementEvents += 1;
    }

    if (edit.insertedChars > 0) {
      const now = performance.now();
      if (lastInsertAt.current > 0) {
        const pauseMs = now - lastInsertAt.current;
        if (pauseMs >= 900) typingProfile.current.pauseCount += 1;
        if (pauseMs > typingProfile.current.longestPauseMs) {
          typingProfile.current.longestPauseMs = Math.round(pauseMs);
          typingProfile.current.longestPauseIndex = edit.changedFrom;
        }
      }
      lastInsertAt.current = now;
    }
    if (edit.removedChars > 0) typingProfile.current.corrections += 1;

    const nextCharacters = Array.from(edit.value);
    if (swipeProfiledLength.current > nextCharacters.length) swipeProfiledLength.current = nextCharacters.length;
    if (!isComposing) {
      let stableLength = 0;
      for (let index = nextCharacters.length - 1; index >= 0; index -= 1) {
        if (/\s/.test(nextCharacters[index] ?? '')) {
          stableLength = index + 1;
          break;
        }
      }
      for (let index = swipeProfiledLength.current; index < stableLength; index += 1) {
        const actual = nextCharacters[index] ?? '';
        const expected = passageCharacters[index] ?? '';
        if (actual !== expected) {
          typingProfile.current.firstTryErrors += 1;
          if (typingProfile.current.mistakes.length < 24) {
            typingProfile.current.mistakes.push({ expected, actual, index });
          }
        }
      }
      swipeProfiledLength.current = Math.max(swipeProfiledLength.current, stableLength);
    }

    const nextTotal = currentTotal.current + edit.insertedChars;
    currentInput.current = edit.value;
    currentTotal.current = nextTotal;
    setInput(edit.value);
    setTotalTypedChars(nextTotal);
    if (edit.value === passage.text) {
      finish(edit.value, nextTotal, Date.now() - startedAt.current);
    }
  }, [finish, passage.text, passageCharacters]);

  useEffect(() => {
    if (!armed || countdown <= 0) return;
    const timer = window.setTimeout(() => {
      if (countdown === 1) {
        clearInputDiagnostics();
        if (inputRef.current) {
          if (inputPreference === 'swipe') inputRef.current.value = '';
          else resetRaceInputField(inputRef.current);
        }
        currentInput.current = '';
        currentTotal.current = 0;
        typingProfile.current = emptyTypingProfile();
        inputTelemetry.current = emptyInputTelemetry();
        lastInsertAt.current = 0;
        swipeProfiledLength.current = 0;
        setInput('');
        setTotalTypedChars(0);
        startedAt.current = Date.now();
        activeRef.current = true;
        setActive(true);
        setCountdown(0);
        window.setTimeout(() => focusRaceInput(inputRef.current), 80);
      } else {
        setCountdown((value) => value - 1);
      }
    }, 850);
    return () => window.clearTimeout(timer);
  }, [armed, countdown, inputPreference]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt.current;
      setRemainingMs(Math.max(0, durationSec * 1_000 - elapsed));
      if (elapsed >= durationSec * 1_000) finish(currentInput.current, currentTotal.current, durationSec * 1_000);
    }, 50);
    return () => window.clearInterval(timer);
  }, [active, durationSec, finish]);

  useEffect(() => {
    const field = inputRef.current;
    if (!field) return;

    const handleBeforeInput = (event: InputEvent) => {
      recordInputDiagnostic('standard:before', event, field);
      const swipeMode = inputPreference === 'swipe';
      if (swipeMode) {
        if (!isNativeSwipeInputType(event.inputType) && event.cancelable) event.preventDefault();
        return;
      }
      event.preventDefault();
      resetRaceInputField(field);
      const physical = lastPhysicalEdit.current;
      if (physical
        && performance.now() - physical.at < 120
        && physical.inputType === event.inputType
        && physical.data === event.data) {
        lastPhysicalEdit.current = null;
        return;
      }
      applyRaceEdit(event.inputType, event.data, 'virtual');
    };

    const handleInput = (event: Event) => {
      recordInputDiagnostic('standard:after', event, field);
      const swipeMode = inputPreference === 'swipe';
      if (!swipeMode) {
        resetRaceInputField(field);
        return;
      }
      const inputEvent = event as InputEvent;
      const inputType = typeof inputEvent.inputType === 'string' ? inputEvent.inputType : '';
      if (!isNativeSwipeInputType(inputType)) {
        field.value = currentInput.current;
        field.setSelectionRange(field.value.length, field.value.length);
        return;
      }
      applySwipeValue(field.value, inputType, inputEvent.isComposing);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      recordInputDiagnostic('standard:key', event, field);
      if (inputPreference === 'swipe') return;
      const edit = physicalKeyEdit(event.key, event);
      if (!edit) return;
      event.preventDefault();
      resetRaceInputField(field);
      lastPhysicalEdit.current = { ...edit, at: performance.now() };
      applyRaceEdit(edit.inputType, edit.data, 'physical');
    };

    const handleComposition = (event: CompositionEvent) => {
      recordInputDiagnostic(`standard:${event.type}`, event, field);
    };

    field.addEventListener('beforeinput', handleBeforeInput);
    field.addEventListener('input', handleInput);
    field.addEventListener('keydown', handleKeyDown);
    field.addEventListener('compositionstart', handleComposition);
    field.addEventListener('compositionupdate', handleComposition);
    field.addEventListener('compositionend', handleComposition);
    return () => {
      field.removeEventListener('beforeinput', handleBeforeInput);
      field.removeEventListener('input', handleInput);
      field.removeEventListener('keydown', handleKeyDown);
      field.removeEventListener('compositionstart', handleComposition);
      field.removeEventListener('compositionupdate', handleComposition);
      field.removeEventListener('compositionend', handleComposition);
    };
  }, [applyRaceEdit, applySwipeValue, inputPreference]);

  const armRace = async () => {
    focusRaceInput(inputRef.current);
    setArming(true); setArmError('');
    try {
      await onArm();
      setArmed(true);
    } catch (error) {
      setArmError(error instanceof Error ? error.message : 'The countdown could not start.');
    } finally {
      setArming(false);
    }
  };

  return (
    <main className="race-page game-page" onClick={() => focusRaceInput(inputRef.current)}>
      <header className="race-top"><button onClick={(event) => { event.stopPropagation(); onCancel(); }}>✕ EXIT</button><span>{mode.toUpperCase()} · {languageName(passage.language).toUpperCase()}</span><small>BACKSPACE ENABLED · {inputPreference === 'swipe' ? 'SWIPE INPUT READY' : 'TAP INPUT READY'}</small></header>
      <section className="race-hud">
        <RaceMetric value={Math.round(metrics.netWpm)} label="NET WPM" accent />
        <RaceMetric value={`${metrics.accuracy.toFixed(1)}%`} label="ACCURACY" />
        <div className="race-clock"><b>{Math.ceil(remainingMs / 1_000)}</b><small>SECONDS</small></div>
        <RaceMetric value={metrics.incorrectChars} label="ERRORS" warning={metrics.incorrectChars > 0} />
        <RaceMetric value={`${inputCharacters.length}/${passageCharacters.length}`} label="PROGRESS" />
      </section>
      <section className="passage-card" ref={passageCardRef}>
        {!armed ? (
          <div className="countdown ready-prompt"><small>KEYBOARD CHECK</small><b>READY?</b><span>Tap once to open your keyboard and begin the countdown.</span>{armError && <span className="inline-error" role="alert">{armError}</span>}<button className="primary-button" onClick={() => void armRace()} disabled={arming}>{arming ? 'CONNECTING…' : 'TAP TO START'}</button></div>
        ) : !active ? (
          <div className="countdown" aria-live="assertive"><small>GET READY</small><b>{countdown || 'GO'}</b><span>Stay focused—the clock starts at GO.</span></div>
        ) : (
          <div className="passage-wrap">
            <p aria-label={`Typing passage: ${passage.text}`}>
              {Array.from(passage.text).map((character, index) => {
                const state = index >= inputCharacters.length ? 'pending' : inputCharacters[index] === character ? 'correct' : 'incorrect';
                return <span key={index} ref={index === inputCharacters.length ? currentCharacterRef : undefined} className={`${state} ${index === inputCharacters.length ? 'current' : ''}`}>{character}</span>;
              })}
            </p>
            <div className="progress-track"><span style={{ width: `${Math.min(100, inputCharacters.length / passageCharacters.length * 100)}%` }} /></div>
          </div>
        )}
      </section>
      <div className={`race-input-shell ${inputPreference === 'swipe' ? 'native-swipe' : ''}`}>
        <textarea
          id="race-typing-input"
          ref={inputRef}
          className={`race-input ${inputPreference === 'swipe' ? 'race-input-native' : 'race-input-proxy'}`}
          defaultValue={inputPreference === 'swipe' ? '' : RACE_INPUT_SENTINEL}
          onFocus={(event) => { if (inputPreference !== 'swipe') resetRaceInputField(event.currentTarget); }}
          onPaste={(event) => event.preventDefault()}
          onDrop={(event) => event.preventDefault()}
          onBlur={() => { if (active && !finished.current) setTimeout(() => focusRaceInput(inputRef.current), 100); }}
          autoComplete="off"
          autoCorrect={inputPreference === 'swipe' ? 'on' : 'off'}
          autoCapitalize={inputPreference === 'swipe' ? 'sentences' : 'none'}
          inputMode="text"
          enterKeyHint="done"
          rows={1}
          wrap="off"
          spellCheck={inputPreference === 'swipe'}
          aria-label="Race typing input"
        />
      </div>
    </main>
  );
}

function RaceMetric({ value, label, accent, warning }: { value: string | number; label: string; accent?: boolean; warning?: boolean }) {
  return <span className={`race-metric ${accent ? 'accent' : ''} ${warning ? 'warning' : ''}`}><b>{value}</b><small>{label}</small></span>;
}

function Results({ result, saving, signedIn, playerHandle, message, onRankedMatch, onFriendlyMatch, onAgain, onHome, onSignIn }: {
  result: SavedResult;
  saving: boolean;
  signedIn: boolean;
  playerHandle?: string;
  message: string;
  onRankedMatch: (match: NonNullable<SavedResult['match']>) => void;
  onFriendlyMatch: (match: NonNullable<SavedResult['friendlyMatch']>) => void;
  onAgain: () => void;
  onHome: () => void;
  onSignIn: () => void;
}) {
  const outcome = result.challengeOutcome ?? result.friendlyMatch?.outcome ?? result.match?.outcome;
  const custom = isCustomPassage(result.passage);
  const doubleXpUntil = result.match?.doubleXpUntil ?? result.friendlyMatch?.doubleXpUntil ?? result.doubleXpUntil;
  const headline = saving ? 'Validating your run…' : outcome === 'win' ? 'You took the win.' : outcome === 'loss' ? 'Your rival got this one.' : outcome === 'draw' ? 'Dead even.' : result.metrics.accuracy >= 97 ? 'Fast and under control.' : 'Baseline recorded.';

  useEffect(() => {
    if (result.mode !== 'ranked' || result.match?.status !== 'pending' || !result.sessionId) return;
    let stopped = false;
    let timer = 0;

    const checkMatch = async () => {
      try {
        const response = await authFetch(`/api/sessions/${encodeURIComponent(result.sessionId!)}`, { cache: 'no-store' });
        const data = await response.json() as RankedSessionApiResult;
        if (!stopped && response.ok && data.match.status === 'matched') {
          onRankedMatch(data.match);
          return;
        }
      } catch {
        // The next poll can recover from a transient connection failure.
      }
      if (!stopped) timer = window.setTimeout(checkMatch, 5_000);
    };

    timer = window.setTimeout(checkMatch, 2_500);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [onRankedMatch, result.match?.status, result.mode, result.sessionId]);

  useEffect(() => {
    if (result.mode !== 'friendly' || result.friendlyMatch || !result.challengeUrl) return;
    const code = new URL(result.challengeUrl).searchParams.get('challenge');
    if (!code) return;
    let stopped = false;
    let timer = 0;

    const checkChallenge = async () => {
      try {
        const response = await authFetch(`/api/challenges/${encodeURIComponent(code)}`, { cache: 'no-store' });
        const data = await response.json() as ChallengeStatusApiResult;
        if (!stopped && response.ok && data.latestAttempt) {
          onFriendlyMatch({
            outcome: data.latestAttempt.creatorOutcome,
            opponentHandle: data.latestAttempt.challengerHandle,
            opponentMetrics: data.latestAttempt.challengerMetrics,
            doubleXpUntil: data.latestAttempt.doubleXpUntil,
          });
          return;
        }
      } catch {
        // A later poll can recover if the rival finishes during a brief outage.
      }
      if (!stopped) timer = window.setTimeout(checkChallenge, 5_000);
    };

    timer = window.setTimeout(checkChallenge, 2_500);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [onFriendlyMatch, result.challengeUrl, result.friendlyMatch, result.mode]);

  const shareChallenge = async () => {
    if (!result.challengeUrl) return;
    const data = { title: 'TypeRival challenge', text: `I set a TypeRival score. Can you beat it?`, url: result.challengeUrl };
    if (navigator.share) await navigator.share(data);
    else { await navigator.clipboard.writeText(result.challengeUrl); window.alert('Challenge link copied.'); }
  };

  return (
    <main className="results-page">
      <section className="result-copy">
        <span className="eyebrow">{saving ? 'SERVER CHECK' : outcome ? `${outcome.toUpperCase()} · HEAD-TO-HEAD` : 'RUN COMPLETE'}</span>
        <h1>{headline}</h1>
        <p>{custom ? 'Custom-passage results are unverified training: they do not change XP, ratings, verified averages, or public leaderboards.' : result.riskStatus === 'review' ? 'This run is held for integrity review and will not reach public rankings yet.' : result.saved ? 'Your result passed validation and your progress is saved.' : signedIn ? message || 'This result stayed local.' : 'Sign in to save XP, history, and ranked results.'}</p>
        <div className="reward-card"><span><small>{custom ? 'CUSTOM TRAINING' : 'SESSION REWARD'}</small><b>+{result.xpEarned + (result.missionBonusXp ?? 0)} XP</b></span><em>{custom ? 'UNVERIFIED' : result.xpMultiplier === 2 ? '2× APPLIED' : result.saved ? 'SAVED' : 'LOCAL'}</em></div>
        {(result.missionBonusXp ?? 0) > 0 && <div className="mission-earned"><b>MISSION COMPLETE · +{result.missionBonusXp} XP</b><span>{result.progression?.newlyCompleted.map((key) => missionTitle(key)).join(' · ')}</span></div>}
        {result.progression && <ResultProgress progression={result.progression} />}
        {outcome === 'win' && isBoostActive(doubleXpUntil) && <div className="boost-earned"><b>2× XP ACTIVATED</b><span>Your next runs earn double XP for about {boostMinutes(doubleXpUntil)} minutes.</span></div>}
        {result.challengeUrl && <button className="share-button" onClick={shareChallenge}>SHARE CHALLENGE LINK ↗</button>}
        {result.mode === 'ranked' && result.match?.status === 'pending' && <div className="pending-match"><i />Result banked. We’ll pair it with the next compatible rival.</div>}
        {result.mode === 'friendly' && !result.friendlyMatch && <div className="pending-match"><i />Challenge ready. This screen updates when your rival finishes.</div>}
        {result.match?.status === 'matched' && <div className="pending-match"><i />vs. {result.match.opponentHandle} · {formatDelta(result.match.ratingDelta)} rating</div>}
        {result.friendlyMatch && <div className="pending-match"><i />vs. {result.friendlyMatch.opponentHandle} · friendly result complete</div>}
        {!signedIn && <button className="text-button result-signin" onClick={onSignIn}>SIGN IN TO START YOUR VERIFIED HISTORY →</button>}
      </section>
      <section className="result-performance">
        <section className="result-card">
          <div className="hero-result"><span>{inputMethodLabel(result.inputMethod)}</span><b>{Math.round(result.metrics.netWpm)}</b><small>NET WPM</small></div>
          <div className="result-grid">
            <RaceMetric value={`${result.metrics.accuracy.toFixed(1)}%`} label="ACCURACY" accent={result.metrics.accuracy >= 97} />
            <RaceMetric value={Math.round(result.metrics.grossWpm)} label="GROSS WPM" />
            <RaceMetric value={result.metrics.incorrectChars} label="ERRORS" warning={result.metrics.incorrectChars > 0} />
            <RaceMetric value={Math.round(result.metrics.performanceScore)} label="SCORE" />
          </div>
          <div className="result-detail-strip">
            <span><small>CORRECT</small><b>{result.metrics.correctChars}</b></span>
            <span><small>KEYS SENT</small><b>{result.totalTypedChars}</b></span>
            <span><small>TIME</small><b>{(result.elapsedMs / 1_000).toFixed(1)}s</b></span>
            <span><small>CORRECTIONS</small><b>{result.typingProfile.corrections}</b></span>
          </div>
          <ShareResultButton result={result} playerHandle={playerHandle} />
          <div className="result-actions"><button className="primary-button" onClick={onAgain}>RUN IT BACK</button><button className="secondary-button" onClick={onHome}>HOME</button></div>
        </section>
        <ResultInsightRail result={result} onAgain={onAgain} />
      </section>
      {(result.passage.learning || custom) && <LearningCard passage={result.passage} />}
      {result.mode === 'practice'
        ? <PracticeBreakdown result={result} />
        : <CompetitiveBreakdown result={result} playerHandle={playerHandle} />}
    </main>
  );
}

function ResultProgress({ progression }: { progression: Progression }) {
  return <div className="result-level-progress">
    <div><span>LV {progression.level.level}</span><b>{progression.level.name}</b><small>{progression.totalXp.toLocaleString()} TOTAL XP</small></div>
    <ProgressBar value={progression.level.percent} label={`${Math.round(progression.level.percent)}% to the next level`} />
    <small>{progression.level.nextLevel ? `${progression.level.xpForNextLevel - progression.level.xpIntoLevel} XP TO ${progression.level.nextLevel.name.toUpperCase()}` : 'ELITE RIVAL ACHIEVED'}</small>
  </div>;
}

function ResultInsightRail({ result, onAgain }: { result: SavedResult; onAgain: () => void }) {
  const practiceReport = result.mode === 'practice' ? result.coachingReport ?? buildPracticeCoachingReport({
    passage: result.passage.text,
    input: result.input,
    metrics: result.metrics,
    profile: result.typingProfile,
  }) : null;
  const competitiveInsights = [
    {
      label: 'ACCURACY GATE',
      title: result.metrics.accuracy >= 90 ? 'Gate cleared.' : 'Accuracy cost the race.',
      body: result.metrics.accuracy >= 90 ? `${result.metrics.accuracy.toFixed(1)}% keeps this performance fully competitive.` : 'Reach 90% accuracy before adding more pace.',
    },
    {
      label: 'PACE CONTROL',
      title: `${Math.max(0, Math.round(result.metrics.grossWpm - result.metrics.netWpm))} WPM lost to errors`,
      body: result.metrics.incorrectChars === 0 ? 'A clean run: your gross and net pace stayed aligned.' : `${result.metrics.incorrectChars} errors opened the gap between raw speed and your scored pace.`,
    },
    {
      label: 'NEXT MOVE',
      title: result.metrics.accuracy >= 97 ? 'Push the pace.' : 'Protect the rhythm.',
      body: result.metrics.accuracy >= 97 ? 'You have enough control to target a slightly faster opening.' : 'Start five percent slower and build speed after the first clean sentence.',
    },
  ];

  return <aside className="result-insight-rail" aria-label="Visible coaching insights">
    <header><span className="eyebrow">COACHING · ALWAYS VISIBLE</span><h2>Read the run.</h2><p>{practiceReport?.summary ?? 'Three signals to carry into the next head-to-head.'}</p></header>
    <div>
      {(practiceReport ? practiceReport.insights.slice(0, 3).map((insight) => ({ label: insight.label, title: insight.title, body: insight.body })) : competitiveInsights).map((insight) => <article key={`${insight.label}-${insight.title}`}>
        <span>{insight.label}</span><h3>{insight.title}</h3><p>{insight.body}</p>
      </article>)}
    </div>
    <button className="secondary-button" onClick={onAgain}>{practiceReport ? 'RUN IT BACK WITH THIS FOCUS' : 'TAKE ANOTHER RUN'}</button>
  </aside>;
}

function LearningCard({ passage }: { passage: Passage }) {
  const custom = isCustomPassage(passage);
  return <section className="learning-card">
    <span className="eyebrow">{custom ? 'CUSTOM PASSAGE · UNVERIFIED' : `${categoryName(passage.category).toUpperCase()} · KEEP LEARNING`}</span>
    <h2>{passage.title ?? categoryName(passage.category)}</h2>
    <p>{passage.learning?.summary ?? 'This passage came from a player and has not been reviewed by TypeRival for accuracy or rights.'}</p>
    {passage.learning?.sourceUrl && <a href={passage.learning.sourceUrl} target="_blank" rel="noreferrer">OPEN SOURCE · {passage.learning.sourceLabel} ↗</a>}
  </section>;
}

function ShareResultButton({ result, playerHandle }: { result: SavedResult; playerHandle?: string }) {
  const [shareStatus, setShareStatus] = useState('');
  const opponentHandle = result.creatorHandle ?? result.friendlyMatch?.opponentHandle ?? result.match?.opponentHandle;
  const outcome = result.challengeOutcome ?? result.friendlyMatch?.outcome ?? result.match?.outcome;

  const shareResult = async () => {
    setShareStatus('');
    try {
      const shareData = {
        wpm: result.metrics.netWpm,
        accuracy: result.metrics.accuracy,
        mode: result.mode === 'challenge' ? 'friendly' : result.mode,
        handle: playerHandle ?? 'Guest Rival',
        opponentHandle,
        outcome,
        host: window.location.host,
      };
      const file = createResultShareFile(shareData);
      const text = resultShareCaption(shareData);
      const nativeShare = { title: 'My TypeRival result', text, files: [file] };

      if (navigator.share && navigator.canShare?.(nativeShare)) {
        await navigator.share(nativeShare);
        setShareStatus('Result card shared.');
        return;
      }

      downloadResultFile(file);
      try {
        await navigator.clipboard?.writeText(text);
        setShareStatus('PNG downloaded and caption copied. Attach it anywhere you post.');
      } catch {
        setShareStatus('PNG downloaded. Attach it anywhere you post.');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setShareStatus('The result card could not be created on this browser.');
    }
  };

  return <div className="result-share">
    <button className="share-button" onClick={() => void shareResult()}>SHARE WPM SNAPSHOT ↗</button>
    {shareStatus && <small role="status">{shareStatus}</small>}
  </div>;
}

function PracticeBreakdown({ result }: { result: SavedResult }) {
  const report = result.coachingReport ?? buildPracticeCoachingReport({
    passage: result.passage.text,
    input: result.input,
    metrics: result.metrics,
    profile: result.typingProfile,
  });
  return <section className="result-details practice-breakdown">
    <header><div><span className="eyebrow">PERSONAL COACH · SESSION {report.sessionNumber}</span><h2>Turn this run into the next one.</h2></div><p>{report.summary}</p></header>
    <div className="coach-trend" aria-label="Recent practice trend">
      <span><small>CURRENT</small><b>{Math.round(result.metrics.netWpm)} WPM</b></span>
      <span><small>5-RUN BASELINE</small><b>{report.trend.baselineWpm === null ? 'BUILDING' : `${report.trend.baselineWpm.toFixed(1)} WPM`}</b></span>
      <span><small>WPM CHANGE</small><b>{formatCoachDelta(report.trend.wpmDelta)}</b></span>
      <span><small>CONSISTENCY</small><b>{report.trend.consistencyLabel}</b></span>
    </div>
    <div className="coach-grid">
      {report.insights.map((insight) => <article key={insight.key}>
        <span>{insight.label}</span><h3>{insight.title}</h3><p>{insight.body}</p><small>{insight.evidence}</small>
      </article>)}
    </div>
    <div className="coach-plan">
      <article className="coach-target"><span>NEXT TARGET</span><strong>{report.target.wpm}<small>WPM</small></strong><b>{report.target.accuracy}%+ ACCURACY</b><p>{report.target.rationale}</p></article>
      <article className="coach-drill"><span>FOCUS DRILL</span><h3>{report.drill.title}</h3><p>{report.drill.focus}</p><blockquote>{report.drill.text}</blockquote><small>Type this twice as a warm-up before your next full run.</small></article>
    </div>
  </section>;
}

function CompetitiveBreakdown({ result, playerHandle }: { result: SavedResult; playerHandle?: string }) {
  const opponentMetrics = result.creatorMetrics ?? result.friendlyMatch?.opponentMetrics ?? result.match?.opponentMetrics;
  const opponentHandle = result.creatorHandle ?? result.friendlyMatch?.opponentHandle ?? result.match?.opponentHandle;
  const waiting = !opponentMetrics;
  const waitingCopy = result.mode === 'ranked'
    ? 'Your result is banked. This comparison updates automatically when a compatible rival finishes.'
    : 'Share the challenge link. This comparison updates automatically when your rival finishes the same passage.';

  return <section className="result-details versus-breakdown">
    <header><div><span className="eyebrow">HEAD-TO-HEAD</span><h2>Both performances, side by side.</h2></div><p>{waiting ? waitingCopy : 'Same passage, same clock, full comparison. Accuracy clears the gate before performance score decides the result.'}</p></header>
    <div className="versus-grid">
      <CompetitorResult label="YOU" handle={playerHandle ?? 'Guest Rival'} metrics={result.metrics} />
      <div className="versus-mark">VS</div>
      {opponentMetrics
        ? <CompetitorResult label="RIVAL" handle={opponentHandle ?? 'Rival'} metrics={opponentMetrics} />
        : <article className="competitor-card waiting-rival"><span>RIVAL</span><strong>?</strong><b>{result.mode === 'ranked' ? 'FINDING A MATCH' : 'AWAITING CHALLENGER'}</b><small>Stats unlock after the rival run.</small></article>}
    </div>
  </section>;
}

function CompetitorResult({ label, handle, metrics }: { label: string; handle: string; metrics: TypingMetrics }) {
  return <article className="competitor-card">
    <span>{label}</span><h3>{handle}</h3>
    <strong>{Math.round(metrics.netWpm)}<small>WPM</small></strong>
    <div><b>{metrics.accuracy.toFixed(1)}%<small>ACCURACY</small></b><b>{metrics.incorrectChars}<small>ERRORS</small></b><b>{Math.round(metrics.performanceScore)}<small>SCORE</small></b></div>
  </article>;
}

function downloadResultFile(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function Leaderboard({ data, language, onLanguage, onBack }: {
  data: Bootstrap;
  language: TypingLanguage;
  onLanguage: (language: TypingLanguage) => void;
  onBack: () => void;
}) {
  const [board, setBoard] = useState<'open' | 'ranked'>('open');
  const [inputMethod, setInputMethod] = useState<InputMethod>('mobile_touch');
  const entries = board === 'open'
    ? data.openLeaderboards[inputMethod] ?? []
    : data.rankedLeaderboards[inputMethod] ?? [];
  const title = board === 'open' ? 'Practice leaderboard' : 'Ranked leaderboard';
  const description = board === 'open'
    ? 'You can hit the leaderboard as soon as your first run is complete. Clear, signed-in results count toward your rolling 30-day averages in the matching input lane.'
    : '45-second ranked runs only. Tap, swipe, and hardware input each have a fair lane.';

  return (
    <main className="leaderboard-page">
      <header><div><span className="eyebrow">ROLLING 30 DAYS · {languageName(language).toUpperCase()}</span><h1>{title}</h1><p>{description}</p></div><button className="back-button" onClick={onBack}>← BACK HOME</button></header>
      <LanguageSelector language={language} onLanguage={onLanguage} compact />
      <nav className="leaderboard-tabs" aria-label="Leaderboard type">
        <button className={board === 'open' ? 'selected' : ''} aria-pressed={board === 'open'} onClick={() => setBoard('open')}>PRACTICE</button>
        <button className={board === 'ranked' ? 'selected' : ''} aria-pressed={board === 'ranked'} onClick={() => setBoard('ranked')}>RANKED</button>
      </nav>
      <nav className="leaderboard-subtabs" aria-label={`${title} input method`}>
        <button className={inputMethod === 'mobile_touch' ? 'selected' : ''} aria-pressed={inputMethod === 'mobile_touch'} onClick={() => setInputMethod('mobile_touch')}>MOBILE TOUCH</button>
        <button className={inputMethod === 'mobile_swipe' ? 'selected' : ''} aria-pressed={inputMethod === 'mobile_swipe'} onClick={() => setInputMethod('mobile_swipe')}>MOBILE SWIPE</button>
        <button className={inputMethod === 'hardware' ? 'selected' : ''} aria-pressed={inputMethod === 'hardware'} onClick={() => setInputMethod('hardware')}>DESKTOP / HARDWARE</button>
      </nav>
      <p className="leaderboard-note">TypeRival classifies the input actually observed during each run. Connected iPad and tablet keyboards join the hardware lane.{board === 'ranked' ? ' Rating remains unified during the async Ranked beta.' : ''}</p>
      <LeaderboardTable entries={entries} emptyLabel={`Complete a signed-in ${inputMethodLabel(inputMethod).toLowerCase()} ${board === 'ranked' ? 'Ranked ' : ''}run to claim the first spot.`} />
    </main>
  );
}

function LeaderboardTable({ entries, emptyLabel }: { entries: LeaderboardEntry[]; emptyLabel: string }) {
  return (
    <section className="leaderboard-table">
        <div className="leaderboard-head"><span>RANK</span><span>RIVAL</span><span>AVG WPM</span><span>ACCURACY</span><span>RUNS</span><span>RATING</span></div>
        {entries.length === 0 ? <div className="empty-board"><b>The ladder is open.</b><span>{emptyLabel}</span></div> : entries.map((entry, index) => (
          <div className="leaderboard-row" key={entry.handle}><span data-label="RANK">#{index + 1}</span><span data-label="RIVAL"><i>{entry.handle.slice(0, 1).toUpperCase()}</i><b>{entry.handle}</b></span><span data-label="AVG WPM">{entry.averageWpm}</span><span data-label="ACCURACY">{entry.accuracy}%</span><span data-label="RUNS">{entry.sessions}</span><span data-label="RATING">{Math.round(entry.rating)}</span></div>
        ))}
      </section>
  );
}

function Account({ player, onBack, onUpdated, onDeleted }: {
  player: Player;
  onBack: () => void;
  onUpdated: () => void;
  onDeleted: () => void | Promise<void>;
}) {
  const [handle, setHandle] = useState(player.handle ?? '');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const saveHandle = async () => {
    setBusy(true); setStatus('');
    try {
      const response = await authFetch('/api/account', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ handle }),
      });
      const data = await response.json() as { handle?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Handle update failed.');
      setHandle(data.handle ?? handle);
      setStatus('Public handle updated.');
      onUpdated();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Handle update failed.');
    } finally {
      setBusy(false);
    }
  };

  const downloadExport = async () => {
    setBusy(true); setStatus('');
    try {
      const response = await authFetch('/api/account/export', { cache: 'no-store' });
      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error ?? 'Export failed.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `typerival-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setStatus('Your data export was downloaded.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  };

  const deleteProfile = async () => {
    const confirmation = window.prompt('This permanently deletes your account, results, XP, rating, and challenges. Type DELETE to continue.');
    if (confirmation !== 'DELETE') return;
    setBusy(true); setStatus('');
    try {
      const response = await authFetch('/api/account', { method: 'DELETE' });
      const data = await response.json() as { deleted?: boolean; error?: string };
      if (!response.ok || !data.deleted) throw new Error(data.error ?? 'Account deletion failed.');
      await onDeleted();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Account deletion failed.');
      setBusy(false);
    }
  };

  return (
    <main className="account-page legal-page">
      <button className="back-button" onClick={onBack}>← BACK HOME</button>
      <span className="eyebrow">ACCOUNT & PRIVACY</span><h1>Control your rival profile.</h1>
      <div className="account-grid">
        <section className="account-card">
          <h2>Public handle</h2>
          <p>Your handle is visible on leaderboards and challenges. Use 3–18 letters, numbers, or underscores—never your email or full name.</p>
          <label><span>HANDLE</span><input value={handle} maxLength={18} onChange={(event) => setHandle(event.target.value)} autoComplete="nickname" /></label>
          <button className="primary-button" onClick={() => void saveHandle()} disabled={busy}>SAVE HANDLE</button>
        </section>
        <section className="account-card">
          <h2>Your data</h2>
          <p>Download a JSON copy of your profile, saved runs, Practice coaching history, mission rewards, friendly challenges, challenge attempts, feedback, and passage submissions.</p>
          <button className="secondary-button" onClick={() => void downloadExport()} disabled={busy}>DOWNLOAD MY DATA</button>
        </section>
        <section className="account-card danger-card">
          <h2>Delete account</h2>
          <p>This permanently removes your account and saved TypeRival data. This action cannot be undone.</p>
          <button className="danger-button" onClick={() => void deleteProfile()} disabled={busy}>DELETE MY ACCOUNT</button>
        </section>
      </div>
      {status && <div className="account-status" role="status">{status}</div>}
    </main>
  );
}

function Legal({ onBack }: { onBack: () => void }) {
  return (
    <main className="legal-page">
      <button className="back-button" onClick={onBack}>← BACK HOME</button>
      <span className="eyebrow">TERMS, PRIVACY & FAIR PLAY · UPDATED SEPTEMBER 3, 2026</span><h1>Fair play comes first.</h1>
      <div className="legal-grid">
        <article><h2>Agreement and eligibility</h2><p>By creating an account or using online competition, you agree to these MVP terms. Players must be at least 13 to create an account. Visitors under 13 may use private, device-only practice and must not submit personal information.</p></article>
        <article><h2>Free MVP</h2><p>TypeRival currently has no entry fees, wagers, cash wallet, purchasable competitive advantage, or cash prizes. XP has no cash value and cannot be transferred, sold, or redeemed.</p></article>
        <article><h2>Scoring</h2><p>Net WPM is based on correct characters and errors. A player below 90% accuracy cannot defeat a player at or above 90%. Remaining ties use performance score, then accuracy. Clear signed-in runs can enter the rolling 30-day leaderboard immediately.</p></article>
        <article><h2>Fair play</h2><p>Automated typing, scripts, macros, emulators used to falsify input, account sharing, collusion, exploiting bugs, and manipulating results are prohibited. TypeRival may hold, remove, or invalidate suspicious results and restrict accounts that threaten the competition.</p></article>
        <article><h2>Information collected</h2><p>For signed-in players, TypeRival stores an account identifier, email through the authentication provider, public handle, run metrics, passage and timing data, broad device class, XP, level and mission reward history, rating, match outcomes, and challenge activity. Practice coaching also stores limited derived signals such as corrections, first-attempt character substitutions, and major hesitations. Operational systems may process IP addresses, device details, and request logs for security and reliability.</p></article>
        <article><h2>How information is used</h2><p>Information is used to authenticate players, save progress, calculate rankings, operate challenges, prevent abuse, troubleshoot failures, and improve the service. TypeRival does not sell personal information or use gameplay data for third-party advertising in this MVP.</p></article>
        <article><h2>Sharing and processors</h2><p>Supabase processes authentication and database data, while Vercel hosts the web application and operational logs. Google processes information when Google sign-in is selected. Data may also be disclosed when required by law or necessary to protect users and the service.</p></article>
        <article><h2>Retention and control</h2><p>Saved gameplay and signed-in coaching history remain while an account is active unless operational or legal needs require a different period. Players can download their TypeRival data and permanently delete their account from the Account page. Guest and under-13 coaching history stays on the device and can be removed by clearing browser site data.</p></article>
        <article><h2>Security and availability</h2><p>TypeRival uses access controls, server validation, encrypted network connections, and rate limits, but no online service can guarantee absolute security or uninterrupted availability. The beta may change, pause, or remove features as it develops.</p></article>
        <article><h2>Challenges and conduct</h2><p>Friendly links expire after seven days and may be shared by anyone who receives them. Challenge results do not change ranked rating. Do not use handles or shared links to impersonate, harass, threaten, or expose another person’s private information.</p></article>
        <article><h2>Passage Studio</h2><p>Custom passages are unverified training and do not affect XP, verified averages, public leaderboards, boosts, or rating. Public submissions require you to confirm that you wrote the text or have permission to submit it. Do not submit private information, unlawful material, harassment, or copyrighted text you do not have permission to use. TypeRival may review, reject, edit, or remove submissions.</p></article>
        <article><h2>Account enforcement</h2><p>Accounts or results may be limited or removed for cheating, abuse, unlawful conduct, security threats, or repeated violations. Players remain responsible for activity performed through their account and should protect their sign-in credentials.</p></article>
        <article><h2>Future prizes</h2><p>Any future sponsor-funded skill event will launch separately with official rules, eligibility and identity checks, jurisdiction controls, tax disclosures, and professional legal review. No prize event is active today.</p></article>
        <article><h2>Disclaimers</h2><p>The MVP is provided on an “as available” basis to the extent permitted by law. Rankings, XP, and availability may change during beta testing. Nothing here waives rights that cannot legally be waived.</p></article>
        <article><h2>Changes and questions</h2><p>Material changes will be reflected by a new update date in this notice. Questions, privacy requests, and appeals should be submitted through the official TypeRival support channel published with the service.</p></article>
      </div>
    </main>
  );
}

function Feedback({ onBack }: { onBack: () => void }) {
  const [category, setCategory] = useState('experience');
  const [device, setDevice] = useState('');
  const [feedback, setFeedback] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const submitFeedback = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setStatus('');
    try {
      const response = await authFetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ category, device, message: feedback }),
      });
      const data = await response.json() as { received?: boolean; error?: string };
      if (!response.ok || !data.received) throw new Error(data.error ?? 'Feedback could not be sent.');
      setFeedback('');
      setStatus('Thanks — your feedback was sent.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Feedback could not be sent.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="feedback-page legal-page">
      <button className="back-button" onClick={onBack}>← BACK HOME</button>
      <span className="eyebrow">BETA FEEDBACK</span><h1>Help shape TypeRival.</h1>
      <p className="feedback-intro">Tell us what felt great, what was confusing, or what broke. Guest and signed-in feedback are both welcome.</p>
      <form className="feedback-form" onSubmit={(event) => void submitFeedback(event)}>
        <label><span>CATEGORY</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="experience">Overall experience</option><option value="bug">Something broke</option><option value="idea">Feature idea</option><option value="other">Other</option></select></label>
        <label><span>DEVICE & BROWSER <small>OPTIONAL</small></span><input value={device} maxLength={120} onChange={(event) => setDevice(event.target.value)} placeholder="Example: iPhone Safari or Windows Chrome" /></label>
        <label><span>YOUR FEEDBACK</span><textarea value={feedback} minLength={10} maxLength={2000} required onChange={(event) => setFeedback(event.target.value)} placeholder="What happened? What did you expect? What should we improve?" /></label>
        <small>Do not include passwords, private account information, or anything you would not want shared with the TypeRival team.</small>
        <button className="primary-button" type="submit" disabled={busy}>{busy ? 'SENDING…' : 'SEND FEEDBACK'}</button>
        {status && <div className="account-status" role="status">{status}</div>}
      </form>
    </main>
  );
}

/* eslint-disable @next/next/no-html-link-for-pages -- Native navigation keeps the age gate usable before hydration. */
function AgeGate({ onChoose }: { onChoose: (age: AgeBand) => void }) {
  const modalRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const modal = modalRef.current;
    const first = modal?.querySelector<HTMLAnchorElement>('a');
    first?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !modal) return;
      const controls = Array.from(modal.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'));
      if (controls.length === 0) return;
      const firstControl = controls[0]!;
      const lastControl = controls[controls.length - 1]!;
      if (event.shiftKey && document.activeElement === firstControl) {
        event.preventDefault(); lastControl.focus();
      } else if (!event.shiftKey && document.activeElement === lastControl) {
        event.preventDefault(); firstControl.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, []);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="age-title">
      <section className="age-modal" ref={modalRef}><span className="wordmark-mark">TR</span><span className="eyebrow">ONE QUICK CHECK</span><h2 id="age-title">Which age range are you in?</h2><p>This keeps the competition and saved-data experience appropriate. We do not need your birthdate.</p>
        <div className="age-options"><a href="/?age=under13" onClick={() => onChoose('under13')}><b>Under 13</b><span>Private practice only</span></a><a href="/?age=teen" onClick={() => onChoose('teen')}><b>13–17</b><span>Free competitive play</span></a><a href="/?age=adult" onClick={() => onChoose('adult')}><b>18+</b><span>All free MVP modes</span></a></div>
        <small>You can change this later by clearing TypeRival’s local site data.</small>
      </section>
    </div>
  );
}
/* eslint-enable @next/next/no-html-link-for-pages */

function formatDelta(value?: number) {
  if (value === undefined || value === null) return 'pending';
  return `${value >= 0 ? '+' : ''}${Math.round(value)}`;
}

function formatCoachDelta(value: number | null) {
  if (value === null) return 'BUILDING';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
}

function missionTitle(key: string) {
  return MISSION_DEFINITIONS.find((mission) => mission.key === key)?.title ?? key;
}

function isBoostActive(value?: string | null) {
  return Boolean(value && Date.parse(value) > Date.now());
}

function boostMinutes(value?: string | null) {
  if (!value) return 0;
  return Math.max(1, Math.ceil((Date.parse(value) - Date.now()) / 60_000));
}

type StoredRun = { netWpm: number; accuracy: number; createdAt: string; language?: TypingLanguage };
const LOCAL_COACHING_HISTORY_KEY = 'typerival-coaching-history-v1';
const TYPING_LANGUAGE_KEY = 'typerival-language-v1';

function readTypingLanguage(): TypingLanguage {
  try {
    const saved = window.localStorage.getItem(TYPING_LANGUAGE_KEY);
    return isTypingLanguage(saved) ? saved : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

function rememberTypingLanguage(language: TypingLanguage) {
  try {
    window.localStorage.setItem(TYPING_LANGUAGE_KEY, language);
  } catch {
    // The selector still works for the current visit when storage is unavailable.
  }
}

function languageName(language: TypingLanguage) {
  return SUPPORTED_LANGUAGES.find((option) => option.code === language)?.nativeLabel ?? 'English';
}

function categoryName(category: PassageCategorySelection) {
  return PASSAGE_CATEGORIES.find((option) => option.code === category)?.label ?? 'Surprise me';
}

function inputMethodLabel(inputMethod: InputMethod) {
  if (inputMethod === 'mobile_swipe') return 'Mobile swipe';
  if (inputMethod === 'mobile_touch') return 'Mobile touch';
  return 'Desktop / hardware';
}

function readStoredCoachingHistory(): CoachingRun[] {
  try {
    const saved = JSON.parse(window.localStorage.getItem(LOCAL_COACHING_HISTORY_KEY) ?? '[]') as unknown;
    if (!Array.isArray(saved)) return [];
    return saved.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const run = entry as Partial<CoachingRun>;
      if (typeof run.passageId !== 'string' || typeof run.createdAt !== 'string' || !run.metrics || !run.profile) return [];
      return [createCoachingRun({
        id: typeof run.id === 'string' ? run.id : undefined,
        passageId: run.passageId,
        createdAt: run.createdAt,
        totalTypedChars: Number(run.totalTypedChars),
        metrics: run.metrics,
        profile: run.profile,
        insightKeys: Array.isArray(run.insightKeys) ? run.insightKeys : [],
      })];
    }).slice(0, 30);
  } catch {
    return [];
  }
}

function readLocalCoachingHistory(language: TypingLanguage): CoachingRun[] {
  return readStoredCoachingHistory().filter((run) => (getPassage(run.passageId)?.language ?? DEFAULT_LANGUAGE) === language);
}

function recordLocalCoachingRun(run: CoachingRun) {
  try {
    const history = readStoredCoachingHistory();
    window.localStorage.setItem(LOCAL_COACHING_HISTORY_KEY, JSON.stringify([run, ...history].slice(0, 30)));
  } catch {
    // The current report still works when private/local storage is unavailable.
  }
}

function browserDeviceClass() {
  const navigatorWithHints = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  return detectDeviceClass({
    mobileHint: navigatorWithHints.userAgentData?.mobile,
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  });
}

const PASSAGE_HISTORY_KEY = 'typerival-passage-history-v1';

function readPassageHistory(): string[] {
  try {
    const activeIds = new Set(PASSAGES.map((passage) => passage.id));
    const saved = JSON.parse(window.localStorage.getItem(PASSAGE_HISTORY_KEY) ?? '[]') as unknown;
    if (!Array.isArray(saved)) return [];
    return saved.filter((id): id is string => typeof id === 'string' && activeIds.has(id));
  } catch {
    return [];
  }
}

function rememberPassage(passageId: string) {
  try {
    const history = readPassageHistory().filter((id) => id !== passageId);
    history.push(passageId);
    window.localStorage.setItem(PASSAGE_HISTORY_KEY, JSON.stringify(history.slice(-PASSAGES.length)));
  } catch {
    // Passage selection still works when storage is unavailable.
  }
}

function chooseFreshPassage(
  previousId: string | undefined,
  language: TypingLanguage,
  category: PassageCategorySelection = 'all',
): Passage {
  const languagePassages = passagesForSelection(language, category);
  const languageIds = new Set(languagePassages.map((candidate) => candidate.id));
  let history = readPassageHistory();
  let excluded = [...new Set([
    ...history.filter((id) => languageIds.has(id)),
    ...(previousId && languageIds.has(previousId) ? [previousId] : []),
  ])];

  if (excluded.length >= languagePassages.length) {
    const retainedLanguageIds = previousId && languageIds.has(previousId) ? [previousId] : excluded.slice(-1);
    history = [...history.filter((id) => !languageIds.has(id)), ...retainedLanguageIds];
    try {
      window.localStorage.setItem(PASSAGE_HISTORY_KEY, JSON.stringify(history));
    } catch {
      // The next cycle can still avoid the immediately previous passage in memory.
    }
    excluded = retainedLanguageIds;
  }

  return choosePassage(excluded, language, category);
}

function recordLocalRun(result: LocalRaceResult): PracticeStats {
  try {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1_000;
    const existing = JSON.parse(window.localStorage.getItem('typerival-local-runs') ?? '[]') as StoredRun[];
    const current = existing.filter((run) => new Date(run.createdAt).getTime() >= cutoff);
    current.push({ netWpm: result.metrics.netWpm, accuracy: result.metrics.accuracy, createdAt: new Date().toISOString(), language: result.passage.language });
    window.localStorage.setItem('typerival-local-runs', JSON.stringify(current.slice(-250)));
    return summarizeLocalRuns(current.filter((run) => (run.language ?? DEFAULT_LANGUAGE) === result.passage.language));
  } catch {
    return emptyStats;
  }
}

function readLocalStats(language: TypingLanguage): PracticeStats {
  try {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1_000;
    const runs = (JSON.parse(window.localStorage.getItem('typerival-local-runs') ?? '[]') as StoredRun[])
      .filter((run) => new Date(run.createdAt).getTime() >= cutoff)
      .filter((run) => (run.language ?? DEFAULT_LANGUAGE) === language);
    return summarizeLocalRuns(runs);
  } catch {
    return emptyStats;
  }
}

function summarizeLocalRuns(runs: StoredRun[]): PracticeStats {
  if (runs.length === 0) return emptyStats;
  const averageWpm = runs.reduce((sum, run) => sum + run.netWpm, 0) / runs.length;
  const accuracy = runs.reduce((sum, run) => sum + run.accuracy, 0) / runs.length;
  return {
    sessions: runs.length,
    averageWpm,
    bestWpm: Math.max(...runs.map((run) => run.netWpm)),
    accuracy,
    activeDays: new Set(runs.map((run) => run.createdAt.slice(0, 10))).size,
  };
}
