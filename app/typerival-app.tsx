'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AuthModal from './auth-modal';
import {
  PASSAGES,
  calculateMetrics,
  choosePassage,
  type GameMode,
  type Passage,
  type TypingMetrics,
} from '../lib/game';
import {
  authFetch,
  configureSupabase,
  getSupabaseBrowserClient,
  type SupabasePublicConfig,
} from '../lib/supabase-browser';

type Screen = 'home' | 'setup' | 'race' | 'results' | 'leaderboard' | 'legal';
type AgeBand = 'under13' | 'teen' | 'adult';

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
  leaderboard: Array<{ handle: string; averageWpm: number; accuracy: number; sessions: number; rating: number }>;
  latestRanked: { matchStatus: string; outcome?: string; ratingDelta?: number } | null;
};

type Challenge = {
  code: string;
  creatorHandle: string;
  passageId: string;
  durationSec: number;
  creatorMetrics: { netWpm: number; accuracy: number };
  expiresAt: string;
};

type LocalRaceResult = {
  passage: Passage;
  mode: GameMode;
  input: string;
  elapsedMs: number;
  totalTypedChars: number;
  metrics: TypingMetrics;
};

type SavedResult = LocalRaceResult & {
  xpEarned: number;
  xpMultiplier?: number;
  saved: boolean;
  riskStatus?: string;
  match?: {
    status: string;
    outcome?: string;
    opponentHandle?: string;
    opponentScore?: number;
    ratingDelta?: number;
    rating?: number;
    doubleXpUntil?: string | null;
  } | null;
  doubleXpUntil?: string | null;
  challengeUrl?: string;
  challengeOutcome?: 'win' | 'loss' | 'draw';
  creatorMetrics?: TypingMetrics;
  creatorHandle?: string;
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
};

type SessionApiResult = {
  error?: string;
  metrics: TypingMetrics;
  xpEarned: number;
  xpMultiplier?: number;
  doubleXpUntil?: string | null;
  saved: boolean;
  riskStatus?: string;
  match?: SavedResult['match'];
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
  latestRanked: null,
};

export default function TypeRivalApp({ supabaseConfig }: { supabaseConfig: SupabasePublicConfig | null }) {
  configureSupabase(supabaseConfig);
  const [screen, setScreen] = useState<Screen>('home');
  const [mode, setMode] = useState<GameMode>('practice');
  const [durationSec, setDurationSec] = useState(45);
  const [passage, setPassage] = useState<Passage>(() => choosePassage());
  const [result, setResult] = useState<SavedResult | null>(null);
  const [bootstrap, setBootstrap] = useState<Bootstrap>(defaultBootstrap);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [ageBand, setAgeBand] = useState<AgeBand | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [installPrompt, setInstallPrompt] = useState<DeferredInstallPrompt | null>(null);
  const [localStats, setLocalStats] = useState<PracticeStats>(emptyStats);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'update'>('signin');
  const ageBandRef = useRef<AgeBand | null>(null);

  const refreshBootstrap = useCallback(async (currentAge: AgeBand | null) => {
    try {
      const query = currentAge ? `?ageBand=${currentAge}` : '';
      const response = await authFetch(`/api/bootstrap${query}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('profile unavailable');
      setBootstrap(await response.json() as Bootstrap);
    } catch {
      setMessage('Online progress is temporarily unavailable. Local practice still works.');
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  useEffect(() => {
    const savedAge = window.localStorage.getItem('typerival-age-band') as AgeBand | null;
    const validAge = savedAge && ['under13', 'teen', 'adult'].includes(savedAge) ? savedAge : null;
    ageBandRef.current = validAge;
    const initializeTimer = window.setTimeout(() => {
      if (validAge) setAgeBand(validAge);
      setLocalStats(readLocalStats());
      void refreshBootstrap(validAge);
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
          const targetPassage = PASSAGES.find((entry) => entry.id === loaded.passageId);
          if (!targetPassage) throw new Error('passage unavailable');
          setChallenge(loaded);
          setPassage(targetPassage);
          setDurationSec(loaded.durationSec);
          setMode('challenge');
          setScreen('setup');
        })
        .catch(() => setMessage('That challenge is unavailable or has expired.'));
    }

    const installHandler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as DeferredInstallPrompt);
    };
    window.addEventListener('beforeinstallprompt', installHandler);
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js');
    const client = getSupabaseBrowserClient();
    const subscription = client?.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setAuthMode('update');
        setAuthOpen(true);
      }
      window.setTimeout(() => void refreshBootstrap(ageBandRef.current), 0);
    }).data.subscription;
    return () => {
      window.clearTimeout(initializeTimer);
      window.clearTimeout(authTimer);
      window.removeEventListener('beforeinstallprompt', installHandler);
      subscription?.unsubscribe();
    };
  }, [refreshBootstrap]);

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
    void refreshBootstrap(ageBand);
  };

  const signOut = async () => {
    await getSupabaseBrowserClient()?.auth.signOut();
    setBootstrap(defaultBootstrap);
    setMessage('Signed out. Practice results will stay on this device.');
    await refreshBootstrap(ageBand);
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
    setDurationSec(nextMode === 'ranked' ? 45 : durationSec);
    const rankedPassage = PASSAGES[Math.floor(Date.now() / 900_000) % PASSAGES.length] ?? PASSAGES[0]!;
    setPassage(nextMode === 'ranked' ? rankedPassage : choosePassage(passage.id));
    setChallenge(null);
    setScreen('setup');
  };

  const completeRace = async (localResult: LocalRaceResult) => {
    setSaving(true);
    setScreen('results');
    setResult({ ...localResult, xpEarned: 0, saved: false });
    if (!bootstrap.user.signedIn || ageBand === 'under13') {
      setLocalStats(recordLocalRun(localResult));
    }
    if (ageBand === 'under13') {
      setResult({ ...localResult, xpEarned: 20, saved: false });
      setSaving(false);
      return;
    }
    try {
      if (localResult.mode === 'challenge' && challenge) {
        const response = await authFetch(`/api/challenges/${challenge.code}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...localResult, ageBand }),
        });
        const data = await response.json() as ChallengeAttemptApiResult;
        if (!response.ok) throw new Error(data.error ?? 'Challenge failed');
        setResult({
          ...localResult,
          xpEarned: data.xpEarned ?? 10,
          xpMultiplier: data.xpMultiplier ?? 1,
          saved: data.saved ?? bootstrap.user.signedIn,
          challengeOutcome: data.outcome,
          creatorMetrics: data.creator,
          creatorHandle: data.creatorHandle,
          doubleXpUntil: data.doubleXpUntil,
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
            ageBand,
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
        setResult({ ...localResult, ...data, challengeUrl });
        if (data.saved) void refreshBootstrap(ageBand);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The result could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const runAgain = () => {
    if (mode !== 'challenge') setPassage((current) => choosePassage(current.id));
    setResult(null);
    setScreen('race');
  };

  const saveAge = async (nextAge: AgeBand) => {
    window.localStorage.setItem('typerival-age-band', nextAge);
    ageBandRef.current = nextAge;
    setAgeBand(nextAge);
    if (nextAge === 'under13') await getSupabaseBrowserClient()?.auth.signOut();
    await refreshBootstrap(nextAge);
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

  const goHome = () => {
    setScreen('home');
    setMode('practice');
    setChallenge(null);
    setResult(null);
    window.history.replaceState({}, '', '/');
  };

  return (
    <>
      <Header
        player={bootstrap.user}
        loading={loadingProfile}
        onHome={goHome}
        onLeaderboard={() => setScreen('leaderboard')}
        onInstall={install}
        onSignIn={openAuth}
        onSignOut={() => void signOut()}
      />

      {message && <div className="toast" role="status"><span>◇</span>{message}<button onClick={() => setMessage('')} aria-label="Dismiss">×</button></div>}

      {screen === 'home' && (
        <Home
          bootstrap={bootstrap}
          localStats={localStats}
          ageBand={ageBand}
          onMode={chooseMode}
          onLeaderboard={() => setScreen('leaderboard')}
        />
      )}

      {screen === 'setup' && (
        <Setup
          mode={mode}
          durationSec={durationSec}
          challenge={challenge}
          onDuration={setDurationSec}
          onBack={goHome}
          onStart={() => setScreen('race')}
        />
      )}

      {screen === 'race' && (
        <RaceView
          key={`${mode}-${passage.id}-${durationSec}`}
          mode={mode}
          durationSec={durationSec}
          passage={passage}
          onCancel={() => setScreen('setup')}
          onComplete={completeRace}
        />
      )}

      {screen === 'results' && result && (
        <Results
          result={result}
          saving={saving}
          signedIn={bootstrap.user.signedIn}
          message={message}
          onAgain={runAgain}
          onHome={goHome}
          onSignIn={openAuth}
        />
      )}

      {screen === 'leaderboard' && <Leaderboard data={bootstrap} onBack={goHome} />}
      {screen === 'legal' && <Legal onBack={goHome} />}

      <footer className="site-footer">
        <span>© 2026 TypeRival · Working title</span>
        <button onClick={() => setScreen('legal')}>Rules, privacy & safety</button>
        <span>Free-to-play MVP · No cash prizes</span>
      </footer>

      {!ageBand && <AgeGate onChoose={saveAge} />}
      {authOpen && (
        <AuthModal
          key={authMode}
          open
          initialMode={authMode}
          onClose={() => setAuthOpen(false)}
          onAuthenticated={authenticated}
        />
      )}
      {(screen === 'setup' || screen === 'race') && <div className="rotate-gate"><b>ROTATE TO LANDSCAPE</b><span>TypeRival races are built for two-thumb play.</span></div>}
    </>
  );
}

function Header({ player, loading, onHome, onLeaderboard, onInstall, onSignIn, onSignOut }: {
  player: Player;
  loading: boolean;
  onHome: () => void;
  onLeaderboard: () => void;
  onInstall: () => void;
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
          <button className="nav-cta" onClick={onSignOut}>Sign out</button>
        ) : (
          <button className="nav-cta" onClick={onSignIn}>Sign in to save</button>
        )}
      </nav>
      <div className="nav-player" aria-live="polite">
        <span className="nav-avatar">{player.handle?.slice(0, 1).toUpperCase() ?? 'R'}</span>
        <span><small>{loading ? 'LOADING' : player.signedIn && isBoostActive(player.doubleXpUntil) ? `2× XP · ${boostMinutes(player.doubleXpUntil)}M` : player.signedIn ? `RATING ${player.rating}` : 'LOCAL PLAYER'}</small><b>{player.handle ?? 'Guest Rival'}</b></span>
      </div>
    </header>
  );
}

function Home({ bootstrap, localStats, ageBand, onMode, onLeaderboard }: {
  bootstrap: Bootstrap;
  localStats: PracticeStats;
  ageBand: AgeBand | null;
  onMode: (mode: GameMode) => void;
  onLeaderboard: () => void;
}) {
  const stats = bootstrap.user.signedIn && ageBand !== 'under13' ? bootstrap.stats : localStats;
  return (
    <main className="home-page">
      <section className="home-hero">
        <div>
          <span className="eyebrow">COMPETITIVE TYPING, BUILT FOR THUMBS</span>
          <h1>Type fast.<br/><i>Stay clean.</i><br/>Own the race.</h1>
          <p>Practice your speed, challenge a friend with one link, or bank a ranked run for a similarly skilled rival.</p>
          <div className="hero-actions">
            <button className="primary-button" onClick={() => onMode('practice')}>START A 45-SECOND RUN</button>
            <button className="text-button" onClick={onLeaderboard}>VIEW 30-DAY BOARD →</button>
          </div>
        </div>
        <div className="hero-scorecard" aria-label="Your 30-day summary">
          <div className="scorecard-head"><span>YOUR 30 DAYS</span><em>{bootstrap.user.signedIn ? 'SYNCED' : 'LOCAL ONLY'}</em></div>
          <strong>{Math.round(stats.averageWpm || 0)}</strong><small>AVERAGE WPM</small>
          <div className="mini-stats">
            <span><b>{Number(stats.accuracy || 0).toFixed(1)}%</b><small>ACCURACY</small></span>
            <span><b>{Math.round(stats.bestWpm || 0)}</b><small>PERSONAL BEST</small></span>
            <span><b>{stats.sessions || 0}</b><small>RUNS</small></span>
          </div>
          {!bootstrap.user.signedIn && <p>Sign in after your run to start building a verified history.</p>}
        </div>
      </section>

      <section className="modes-section">
        <div className="section-title"><span>CHOOSE YOUR MODE</span><small>{ageBand === 'under13' ? 'JUNIOR PRIVATE PRACTICE' : 'OPEN LADDER · TOUCH-FIRST BETA'}</small></div>
        <div className="launch-mode-grid">
          <LaunchCard number="01" title="Practice" label="LIVE" description="Build speed, accuracy, XP, and your rolling 30-day average." action="PRACTICE NOW" onClick={() => onMode('practice')} featured />
          <LaunchCard number="02" title="Ranked" label="ASYNC BETA" description="Bank one standardized run. We pair it with a rival on the same passage." action="RACE A RIVAL" onClick={() => onMode('ranked')} disabled={ageBand === 'under13'} />
          <LaunchCard number="03" title="Friendly" label="LIVE" description="Set a score, copy the challenge link, and send it to anyone." action="CREATE A CHALLENGE" onClick={() => onMode('friendly')} disabled={ageBand === 'under13'} />
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

function Setup({ mode, durationSec, challenge, onDuration, onBack, onStart }: {
  mode: GameMode;
  durationSec: number;
  challenge: Challenge | null;
  onDuration: (duration: number) => void;
  onBack: () => void;
  onStart: () => void;
}) {
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
            : 'Autocorrect, autocomplete, spellcheck, and paste are disabled where your browser allows it.'}</p>
        <div className="setup-rules">
          <span><b>3</b><small>COUNTDOWN</small></span>
          <span><b>90%</b><small>ACCURACY GATE</small></span>
          <span><b>{mode === 'ranked' ? 'G2' : '0'}</b><small>{mode === 'ranked' ? 'RATING SYSTEM' : 'RATING RISK'}</small></span>
        </div>
      </section>
      <section className="setup-card">
        <label>RACE DURATION</label>
        <div className="duration-grid">
          {[30, 45, 60, 120].map((duration) => (
            <button key={duration} className={durationSec === duration ? 'selected' : ''} disabled={mode === 'ranked' || mode === 'challenge'} onClick={() => onDuration(duration)}>
              <b>{duration}</b><small>SEC</small>
            </button>
          ))}
        </div>
        <div className="setup-row"><span><small>PASSAGE</small><b>Balanced original prose</b></span><em>READY</em></div>
        <div className="setup-row"><span><small>INPUT</small><b>Touch or physical keyboard</b></span><em>MVP OPEN CLASS</em></div>
        <button className="primary-button setup-start" onClick={onStart}>START {durationSec}-SECOND RUN</button>
      </section>
    </main>
  );
}

function RaceView({ mode, durationSec, passage, onCancel, onComplete }: {
  mode: GameMode;
  durationSec: number;
  passage: Passage;
  onCancel: () => void;
  onComplete: (result: LocalRaceResult) => void;
}) {
  const [countdown, setCountdown] = useState(3);
  const [active, setActive] = useState(false);
  const [input, setInput] = useState('');
  const [remainingMs, setRemainingMs] = useState(durationSec * 1_000);
  const [totalTypedChars, setTotalTypedChars] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const startedAt = useRef(0);
  const finished = useRef(false);
  const currentInput = useRef('');
  const currentTotal = useRef(0);

  const elapsedMs = durationSec * 1_000 - remainingMs;
  const metrics = useMemo(() => calculateMetrics(passage.text, input, elapsedMs, totalTypedChars), [passage.text, input, elapsedMs, totalTypedChars]);

  const finish = useCallback((finalInput: string, finalTotal: number, finalElapsed: number) => {
    if (finished.current) return;
    finished.current = true;
    onComplete({ passage, mode, input: finalInput, totalTypedChars: finalTotal, elapsedMs: Math.max(1_000, finalElapsed), metrics: calculateMetrics(passage.text, finalInput, finalElapsed, finalTotal) });
  }, [mode, onComplete, passage]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setTimeout(() => {
      if (countdown === 1) {
        startedAt.current = Date.now();
        setActive(true);
        setCountdown(0);
        window.setTimeout(() => inputRef.current?.focus(), 80);
      } else {
        setCountdown((value) => value - 1);
      }
    }, 850);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt.current;
      setRemainingMs(Math.max(0, durationSec * 1_000 - elapsed));
      if (elapsed >= durationSec * 1_000) finish(currentInput.current, currentTotal.current, durationSec * 1_000);
    }, 50);
    return () => window.clearInterval(timer);
  }, [active, durationSec, finish]);

  const handleInput = (nextRaw: string) => {
    if (!active || finished.current) return;
    const next = nextRaw.replace(/[\r\n]/g, '').slice(0, passage.text.length + 20);
    const nextTotal = totalTypedChars + Math.max(0, next.length - input.length);
    setInput(next); setTotalTypedChars(nextTotal);
    currentInput.current = next; currentTotal.current = nextTotal;
    if (next === passage.text) finish(next, nextTotal, Date.now() - startedAt.current);
  };

  return (
    <main className="race-page game-page" onClick={() => inputRef.current?.focus()}>
      <header className="race-top"><button onClick={(event) => { event.stopPropagation(); onCancel(); }}>✕ EXIT</button><span>{mode.toUpperCase()} · {mode === 'ranked' ? 'RANKED BETA' : 'OPEN INPUT'}</span><small>TAP PASSAGE TO REFOCUS</small></header>
      <section className="race-hud">
        <RaceMetric value={Math.round(metrics.netWpm)} label="NET WPM" accent />
        <RaceMetric value={`${metrics.accuracy.toFixed(1)}%`} label="ACCURACY" />
        <div className="race-clock"><b>{Math.ceil(remainingMs / 1_000)}</b><small>SECONDS</small></div>
        <RaceMetric value={metrics.incorrectChars} label="ERRORS" warning={metrics.incorrectChars > 0} />
        <RaceMetric value={`${input.length}/${passage.text.length}`} label="PROGRESS" />
      </section>
      <section className="passage-card">
        {!active ? (
          <div className="countdown"><small>GET READY</small><b>{countdown || 'GO'}</b><span>The race begins automatically.</span></div>
        ) : (
          <div className="passage-wrap">
            <p aria-label={`Typing passage: ${passage.text}`}>
              {Array.from(passage.text).map((character, index) => {
                const state = index >= input.length ? 'pending' : input[index] === character ? 'correct' : 'incorrect';
                return <span key={index} className={`${state} ${index === input.length ? 'current' : ''}`}>{character}</span>;
              })}
            </p>
            <div className="progress-track"><span style={{ width: `${Math.min(100, input.length / passage.text.length * 100)}%` }} /></div>
          </div>
        )}
      </section>
      <textarea
        ref={inputRef}
        className="race-input"
        value={input}
        onChange={(event) => handleInput(event.target.value)}
        onPaste={(event) => event.preventDefault()}
        onDrop={(event) => event.preventDefault()}
        onBlur={() => { if (active && !finished.current) setTimeout(() => inputRef.current?.focus(), 100); }}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-label="Race typing input"
      />
    </main>
  );
}

function RaceMetric({ value, label, accent, warning }: { value: string | number; label: string; accent?: boolean; warning?: boolean }) {
  return <span className={`race-metric ${accent ? 'accent' : ''} ${warning ? 'warning' : ''}`}><b>{value}</b><small>{label}</small></span>;
}

function Results({ result, saving, signedIn, message, onAgain, onHome, onSignIn }: {
  result: SavedResult; saving: boolean; signedIn: boolean; message: string; onAgain: () => void; onHome: () => void; onSignIn: () => void;
}) {
  const outcome = result.challengeOutcome ?? result.match?.outcome;
  const doubleXpUntil = result.match?.doubleXpUntil ?? result.doubleXpUntil;
  const headline = saving ? 'Validating your run…' : outcome === 'win' ? 'You took the win.' : outcome === 'loss' ? 'Your rival got this one.' : outcome === 'draw' ? 'Dead even.' : result.metrics.accuracy >= 97 ? 'Fast and under control.' : 'Baseline recorded.';

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
        <p>{result.riskStatus === 'review' ? 'This run is held for integrity review and will not reach public rankings yet.' : result.saved ? 'Your result passed validation and your progress is saved.' : signedIn ? message || 'This result stayed local.' : 'Sign in to save XP, history, and ranked results.'}</p>
        <div className="reward-card"><span><small>SESSION REWARD</small><b>+{result.xpEarned} XP</b></span><em>{result.xpMultiplier === 2 ? '2× APPLIED' : result.saved ? 'SAVED' : 'LOCAL'}</em></div>
        {outcome === 'win' && isBoostActive(doubleXpUntil) && <div className="boost-earned"><b>2× XP ACTIVATED</b><span>Your next runs earn double XP for about {boostMinutes(doubleXpUntil)} minutes.</span></div>}
        {result.challengeUrl && <button className="share-button" onClick={shareChallenge}>SHARE CHALLENGE LINK ↗</button>}
        {result.mode === 'ranked' && result.match?.status === 'pending' && <div className="pending-match"><i />Result banked. We’ll pair it with the next compatible rival.</div>}
        {result.match?.status === 'matched' && <div className="pending-match"><i />vs. {result.match.opponentHandle} · {formatDelta(result.match.ratingDelta)} rating</div>}
        {!signedIn && <button className="text-button result-signin" onClick={onSignIn}>SIGN IN TO START YOUR VERIFIED HISTORY →</button>}
      </section>
      <section className="result-card">
        <div className="hero-result"><b>{Math.round(result.metrics.netWpm)}</b><small>NET WPM</small></div>
        <div className="result-grid">
          <RaceMetric value={`${result.metrics.accuracy.toFixed(1)}%`} label="ACCURACY" accent={result.metrics.accuracy >= 97} />
          <RaceMetric value={Math.round(result.metrics.grossWpm)} label="GROSS WPM" />
          <RaceMetric value={result.metrics.incorrectChars} label="ERRORS" warning={result.metrics.incorrectChars > 0} />
          <RaceMetric value={Math.round(result.metrics.performanceScore)} label="SCORE" />
        </div>
        {result.creatorMetrics && <p className="opponent-result">{result.creatorHandle}: {Math.round(result.creatorMetrics.netWpm)} WPM · {result.creatorMetrics.accuracy.toFixed(1)}%</p>}
        <div className="result-actions"><button className="primary-button" onClick={onAgain}>RUN IT BACK</button><button className="secondary-button" onClick={onHome}>HOME</button></div>
      </section>
    </main>
  );
}

function Leaderboard({ data, onBack }: { data: Bootstrap; onBack: () => void }) {
  return (
    <main className="leaderboard-page">
      <header><div><span className="eyebrow">ROLLING 30 DAYS</span><h1>Open leaderboard</h1><p>Verified touch and physical-keyboard sessions. Full qualification begins at 10 runs across 5 active days.</p></div><button className="back-button" onClick={onBack}>← BACK HOME</button></header>
      <section className="leaderboard-table">
        <div className="leaderboard-head"><span>RANK</span><span>RIVAL</span><span>AVG WPM</span><span>ACCURACY</span><span>RUNS</span><span>RATING</span></div>
        {data.leaderboard.length === 0 ? <div className="empty-board"><b>The ladder is open.</b><span>Complete a signed-in run to claim the first spot.</span></div> : data.leaderboard.map((entry, index) => (
          <div className="leaderboard-row" key={entry.handle}><span>#{index + 1}</span><span><i>{entry.handle.slice(0, 1).toUpperCase()}</i><b>{entry.handle}</b></span><span>{entry.averageWpm}</span><span>{entry.accuracy}%</span><span>{entry.sessions}</span><span>{Math.round(entry.rating)}</span></div>
        ))}
      </section>
    </main>
  );
}

function Legal({ onBack }: { onBack: () => void }) {
  return (
    <main className="legal-page">
      <button className="back-button" onClick={onBack}>← BACK HOME</button>
      <span className="eyebrow">LAUNCH RULES</span><h1>Fair play comes first.</h1>
      <div className="legal-grid">
        <article><h2>Free MVP</h2><p>TypeRival currently has no entry fees, wagers, cash wallet, purchasable competitive advantage, or cash prizes. XP has no cash value and cannot be transferred or redeemed.</p></article>
        <article><h2>Scoring</h2><p>Net WPM is based on correct characters and errors. A player below 90% accuracy cannot defeat a player at or above 90%. Remaining ties use performance score, then accuracy.</p></article>
        <article><h2>Integrity</h2><p>Paste and common writing assistance are disabled where browsers allow. Server validation can hold implausible runs for review. Automated typing, collusion, and result manipulation are prohibited.</p></article>
        <article><h2>Age & privacy</h2><p>Under-13 visitors receive private device-only practice. Online Junior profiles are not part of this MVP. Signed-in gameplay stores a pseudonymous handle, results, rating, and progression—not message content or precise location.</p></article>
        <article><h2>Challenges</h2><p>Friendly links expire after seven days. Anyone with a link can attempt the same passage and duration. Challenge results do not change ranked rating.</p></article>
        <article><h2>Future prizes</h2><p>Any future sponsor-funded skill event will launch separately with official rules, eligibility checks, jurisdiction controls, and professional legal review. No prize event is active today.</p></article>
      </div>
    </main>
  );
}

function AgeGate({ onChoose }: { onChoose: (age: AgeBand) => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="age-title">
      <section className="age-modal"><span className="wordmark-mark">TR</span><span className="eyebrow">ONE QUICK CHECK</span><h2 id="age-title">Which age range are you in?</h2><p>This keeps the competition and saved-data experience appropriate. We do not need your birthdate.</p>
        <div className="age-options"><button onClick={() => onChoose('under13')}><b>Under 13</b><span>Private practice only</span></button><button onClick={() => onChoose('teen')}><b>13–17</b><span>Free competitive play</span></button><button onClick={() => onChoose('adult')}><b>18+</b><span>All free MVP modes</span></button></div>
        <small>You can change this later by clearing TypeRival’s local site data.</small>
      </section>
    </div>
  );
}

function formatDelta(value?: number) {
  if (value === undefined || value === null) return 'pending';
  return `${value >= 0 ? '+' : ''}${Math.round(value)}`;
}

function isBoostActive(value?: string | null) {
  return Boolean(value && Date.parse(value) > Date.now());
}

function boostMinutes(value?: string | null) {
  if (!value) return 0;
  return Math.max(1, Math.ceil((Date.parse(value) - Date.now()) / 60_000));
}

type StoredRun = { netWpm: number; accuracy: number; createdAt: string };

function recordLocalRun(result: LocalRaceResult): PracticeStats {
  try {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1_000;
    const existing = JSON.parse(window.localStorage.getItem('typerival-local-runs') ?? '[]') as StoredRun[];
    const current = existing.filter((run) => new Date(run.createdAt).getTime() >= cutoff);
    current.push({ netWpm: result.metrics.netWpm, accuracy: result.metrics.accuracy, createdAt: new Date().toISOString() });
    window.localStorage.setItem('typerival-local-runs', JSON.stringify(current.slice(-250)));
    return summarizeLocalRuns(current);
  } catch {
    return emptyStats;
  }
}

function readLocalStats(): PracticeStats {
  try {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1_000;
    const runs = (JSON.parse(window.localStorage.getItem('typerival-local-runs') ?? '[]') as StoredRun[])
      .filter((run) => new Date(run.createdAt).getTime() >= cutoff);
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
