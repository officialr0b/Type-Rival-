'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ACADEMY_KEYBOARD_ROWS,
  ACADEMY_LESSONS,
  ACADEMY_STORAGE_KEY,
  FINGER_LABELS,
  academyCoachTip,
  academyFingerForKey,
  calculateAcademySummary,
  displayAcademyKey,
  emptyAcademyProgress,
  firstIncompleteAcademyStage,
  normalizeAcademyInput,
  parseAcademyProgress,
  recordAcademyLesson,
  type AcademyFinger,
  type AcademyLesson,
  type AcademyProgress,
  type AcademySummary,
} from '../lib/academy';

const AcademyCoach3D = dynamic(() => import('./academy-coach-3d'), {
  ssr: false,
  loading: () => <div className="academy-coach-3d"><div className="academy-model-status"><b>OPENING THE COACH STAGE</b><small>Loading the 3D lesson viewer…</small></div></div>,
});

type AcademyPhase = 'catalog' | 'briefing' | 'drill' | 'summary';

type AcademyDrillSession = {
  queue: string[];
  index: number;
  attempts: number;
  correct: number;
  streak: number;
  longestStreak: number;
};

// Academy can ship and collect lesson feedback before the production model is
// ready. Set this public URL to /academy/miles.vrm when the optimized file lands.
const MODEL_URL = process.env.NEXT_PUBLIC_ACADEMY_MODEL_URL;

export default function Academy({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<AcademyPhase>('catalog');
  const [lesson, setLesson] = useState<AcademyLesson>(ACADEMY_LESSONS[0]);
  const [stageIndex, setStageIndex] = useState(0);
  const [setupChecks, setSetupChecks] = useState<boolean[]>([]);
  const [queue, setQueue] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [streak, setStreak] = useState(0);
  const [coachLine, setCoachLine] = useState('Pick a lesson and I’ll guide every key.');
  const [summary, setSummary] = useState<AcademySummary | null>(null);
  const [progress, setProgress] = useState<AcademyProgress>(emptyAcademyProgress);
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'standby' | 'error'>(MODEL_URL ? 'loading' : 'standby');
  const inputRef = useRef<HTMLInputElement>(null);
  const startedAtRef = useRef(0);
  const lastCorrectAtRef = useRef(0);
  const intervalsRef = useRef<number[]>([]);
  const errorsRef = useRef<Record<string, number>>({});
  const phaseRef = useRef<AcademyPhase>('catalog');
  const drillRef = useRef<AcademyDrillSession>({ queue: [], index: 0, attempts: 0, correct: 0, streak: 0, longestStreak: 0 });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setProgress(parseAcademyProgress(window.localStorage.getItem(ACADEMY_STORAGE_KEY)));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const activeStage = lesson.stages[stageIndex] ?? lesson.stages[0]!;
  const activeKey = phase === 'drill' ? queue[index] ?? 'f' : lesson.focusKeys[0] ?? 'f';
  const activeFinger = academyFingerForKey(activeKey);
  const completedCount = useMemo(
    () => ACADEMY_LESSONS.filter((item) => progress.lessons[item.id]?.completed).length,
    [progress],
  );
  const completedStageCount = useMemo(
    () => ACADEMY_LESSONS.reduce((total, item) => total + (progress.lessons[item.id]?.completedStages.length ?? 0), 0),
    [progress],
  );
  const totalStageCount = useMemo(
    () => ACADEMY_LESSONS.reduce((total, item) => total + item.stages.length, 0),
    [],
  );

  const chooseLesson = (nextLesson: AcademyLesson) => {
    setLesson(nextLesson);
    setStageIndex(firstIncompleteAcademyStage(nextLesson, progress.lessons[nextLesson.id]));
    setSetupChecks(nextLesson.setupChecks.map(() => false));
    setSummary(null);
    setCoachLine(nextLesson.coachIntro);
    setPhase('briefing');
  };

  const beginDrill = () => {
    const normalized = normalizeAcademyInput(activeStage.drill);
    drillRef.current = { queue: normalized, index: 0, attempts: 0, correct: 0, streak: 0, longestStreak: 0 };
    setQueue(normalized);
    setIndex(0);
    setAttempts(0);
    setCorrect(0);
    setStreak(0);
    setSummary(null);
    errorsRef.current = {};
    intervalsRef.current = [];
    startedAtRef.current = performance.now();
    // A beginner may pause to find their starting position. Rhythm should
    // measure the cadence between correct keys, not that initial setup time.
    lastCorrectAtRef.current = 0;
    setCoachLine(`Begin with ${displayAcademyKey(normalized[0] ?? 'f')}. Use your ${FINGER_LABELS[academyFingerForKey(normalized[0] ?? 'f')].toLowerCase()}.`);
    phaseRef.current = 'drill';
    setPhase('drill');
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const finishDrill = useCallback((finalCorrect: number, finalAttempts: number, finalLongestStreak: number) => {
    const completedAt = new Date().toISOString();
    const result = calculateAcademySummary({
      correct: finalCorrect,
      attempts: finalAttempts,
      longestStreak: finalLongestStreak,
      elapsedMs: Math.max(1, performance.now() - startedAtRef.current),
      intervals: intervalsRef.current,
      errors: errorsRef.current,
      stage: activeStage,
    });
    setSummary(result);
    setCoachLine(result.passed
      ? stageIndex === lesson.stages.length - 1
        ? 'That was controlled and repeatable. This lesson is mastered.'
        : `${activeStage.label} cleared. The next stage will add another layer of control.`
      : result.weakKeys[0]
        ? `${displayAcademyKey(result.weakKeys[0].key)} needs another calm pass. Accuracy comes before speed.`
        : 'Good first pass. Repeat it once more and make the rhythm smoother.');
    setProgress((current) => {
      const next = recordAcademyLesson(current, lesson, activeStage, result, completedAt);
      window.localStorage.setItem(ACADEMY_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    phaseRef.current = 'summary';
    setPhase('summary');
  }, [activeStage, lesson, stageIndex]);

  const enterKey = useCallback((rawKey: string) => {
    if (phaseRef.current !== 'drill') return;
    const key = rawKey.length === 1 ? rawKey.toLowerCase() : rawKey;
    const session = drillRef.current;
    const expected = session.queue[session.index];
    if (!expected || !(key === ' ' || /^[a-z,.;/]$/.test(key))) return;

    session.attempts += 1;
    setAttempts(session.attempts);
    if (key !== expected) {
      const misses = (errorsRef.current[expected] ?? 0) + 1;
      errorsRef.current = { ...errorsRef.current, [expected]: misses };
      session.streak = 0;
      setStreak(0);
      setCoachLine(academyCoachTip(expected, misses));
      // Keep the authored drill immutable. The missed key remains active until
      // it is corrected, so the movement repeats without corrupting the word.
      return;
    }

    const now = performance.now();
    if (lastCorrectAtRef.current > 0) intervalsRef.current.push(now - lastCorrectAtRef.current);
    lastCorrectAtRef.current = now;
    session.correct += 1;
    session.streak += 1;
    session.longestStreak = Math.max(session.longestStreak, session.streak);
    session.index += 1;
    setCorrect(session.correct);
    setStreak(session.streak);
    setIndex(session.index);
    if (session.index >= session.queue.length) {
      finishDrill(session.correct, session.attempts, session.longestStreak);
      return;
    }
    const upcoming = session.queue[session.index];
    setCoachLine(session.streak > 0 && session.streak % 10 === 0
      ? `${session.streak} clean keys. Keep the same light rhythm.`
      : `${FINGER_LABELS[academyFingerForKey(upcoming)]} → ${displayAcademyKey(upcoming)}`);
  }, [finishDrill]);

  const captureInput = (value: string) => {
    for (const key of Array.from(value)) enterKey(key);
  };

  useEffect(() => {
    const captureHardwareKey = (event: KeyboardEvent) => {
      if (phaseRef.current !== 'drill' || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (!(key === ' ' || /^[a-z,.;/]$/.test(key))) return;
      // Capture at the window boundary so Edge, Safari, and attached tablet
      // keyboards keep working if the visible input loses focus mid-lesson.
      event.preventDefault();
      enterKey(key);
    };
    window.addEventListener('keydown', captureHardwareKey, true);
    return () => window.removeEventListener('keydown', captureHardwareKey, true);
  }, [enterKey]);

  const showCatalog = () => {
    phaseRef.current = 'catalog';
    setPhase('catalog');
    setSummary(null);
    setCoachLine('Pick a lesson and I’ll guide every key.');
  };

  const nextLesson = () => {
    const next = ACADEMY_LESSONS.find((item) => item.order === lesson.order + 1) ?? ACADEMY_LESSONS[0];
    chooseLesson(next);
  };

  const continueAfterStage = () => {
    if (stageIndex < lesson.stages.length - 1) {
      setStageIndex((current) => current + 1);
      setSetupChecks(lesson.setupChecks.map(() => false));
      setSummary(null);
      setCoachLine(`Next up: ${lesson.stages[stageIndex + 1]!.title}.`);
      phaseRef.current = 'briefing';
      setPhase('briefing');
      return;
    }
    nextLesson();
  };

  return (
    <main className="academy-page">
      <header className="academy-heading">
        <div>
          <button className="back-button" onClick={phase === 'catalog' ? onBack : showCatalog}>← {phase === 'catalog' ? 'BACK HOME' : 'ALL LESSONS'}</button>
          <span className="eyebrow">TYPE RIVAL ACADEMY · MVP</span>
          <h1>Learn the motion.<br/><i>Unlock the speed.</i></h1>
          <p>Miles coaches the key, finger, posture, and rhythm behind faster typing through an 18-stage path. A missed key stays active until you correct the movement—the lesson text never changes underneath you.</p>
        </div>
        <div className="academy-overview" aria-label="Academy progress">
          <span><small>MASTERY</small><b>{completedStageCount}/{totalStageCount}</b><em>stages cleared</em></span>
          <span><small>LESSONS</small><b>{completedCount}/{ACADEMY_LESSONS.length}</b><em>fully mastered</em></span>
          <span><small>DRILLS</small><b>{progress.totalDrills}</b><em>completed here</em></span>
        </div>
      </header>

      <section className={`academy-workspace phase-${phase}`} aria-live="polite">
        <aside className="academy-coach-panel">
          {MODEL_URL
            ? <AcademyCoach3D modelUrl={MODEL_URL} activeFinger={activeFinger} celebrating={Boolean(summary?.passed)} onStatus={setModelStatus} />
            : <AcademyCoachPreview />}
          <div className="academy-coach-caption">
            <span><b>MILES</b><small>ACADEMY COACH · {modelStatus === 'ready' ? '3D ACTIVE' : modelStatus === 'loading' ? 'LOADING' : 'LESSONS ACTIVE'}</small></span>
            <p>{coachLine}</p>
          </div>
        </aside>

        {phase === 'catalog' && (
          <div className="academy-catalog">
            <div className="academy-section-title"><span>18-STAGE GUIDED PATH</span><small>LEARN · BUILD · MASTER</small></div>
            <div className="academy-lesson-grid">
              {ACADEMY_LESSONS.map((item) => {
                const saved = progress.lessons[item.id];
                const stagesComplete = saved?.completedStages.length ?? 0;
                const finalStage = item.stages[item.stages.length - 1]!;
                return <article key={item.id} className={saved?.completed ? 'complete' : ''}>
                  <div className="academy-lesson-meta"><span>{String(item.order).padStart(2, '0')}</span><em>{saved?.completed ? 'MASTERED' : `${stagesComplete}/${item.stages.length} STAGES`}</em></div>
                  <h2>{item.title}</h2>
                  <p>{item.description}</p>
                  <dl>
                    <div><dt>TIME</dt><dd>{item.duration}</dd></div>
                    <div><dt>TARGET</dt><dd>{finalStage.passAccuracy}% accuracy</dd></div>
                    <div><dt>BEST</dt><dd>{saved ? `${saved.bestAccuracy.toFixed(1)}%` : '—'}</dd></div>
                  </dl>
                  <button aria-label={`${saved ? 'Continue' : 'Start'} ${item.title} lesson`} className={item.order === 1 && !saved ? 'primary-button' : 'secondary-button'} onClick={() => chooseLesson(item)}>{saved?.completed ? 'PRACTICE PEAK STAGE' : saved ? 'CONTINUE LESSON' : 'START LESSON'}</button>
                </article>;
              })}
            </div>
          </div>
        )}

        {phase === 'briefing' && (
          <div className="academy-briefing">
            <span className="academy-step">LESSON {String(lesson.order).padStart(2, '0')} · STAGE {stageIndex + 1} OF {lesson.stages.length} · {activeStage.label.toUpperCase()}</span>
            <h2>{lesson.title}</h2>
            <div className="academy-stage-brief">
              <b>{activeStage.title}</b>
              <p>{activeStage.goal}</p>
            </div>
            <div className="academy-focus-keys" aria-label="Lesson focus keys">
              {lesson.focusKeys.map((key) => <kbd key={key}>{displayAcademyKey(key)}</kbd>)}
            </div>
            <fieldset>
              <legend>SET YOUR FORM</legend>
              {lesson.setupChecks.map((check, checkIndex) => (
                <label key={check}>
                  <input
                    type="checkbox"
                    checked={Boolean(setupChecks[checkIndex])}
                    onChange={(event) => setSetupChecks((current) => current.map((value, indexValue) => indexValue === checkIndex ? event.target.checked : value))}
                  />
                  <span><b>{checkIndex + 1}</b>{check}</span>
                </label>
              ))}
            </fieldset>
            <button className="primary-button academy-begin" onClick={beginDrill} disabled={!setupChecks.every(Boolean)}>BEGIN {activeStage.label.toUpperCase()} DRILL</button>
            {!setupChecks.every(Boolean) && <small className="academy-ready-note">Confirm each setup check so Miles can coach from a strong starting position.</small>}
          </div>
        )}

        {phase === 'drill' && (
          <div className="academy-drill">
            <header>
              <span><small>{activeStage.label.toUpperCase()} · {stageIndex + 1}/{lesson.stages.length}</small><b>{lesson.shortTitle}</b></span>
              <span><small>ACCURACY</small><b>{attempts > 0 ? `${(correct / attempts * 100).toFixed(1)}%` : '100%'}</b></span>
              <span><small>STREAK</small><b>{streak}</b></span>
              <span><small>PROGRESS</small><b>{Math.min(index, queue.length)}/{queue.length}</b></span>
            </header>

            <div className="academy-target">
              <small>NEXT KEY</small>
              <strong>{displayAcademyKey(activeKey)}</strong>
              <span className={`finger-chip finger-${activeFinger}`}>{FINGER_LABELS[activeFinger]}</span>
            </div>

            <div className="academy-sequence" aria-label="Current drill sequence">
              {queue.slice(Math.max(0, index - 6), index + 24).map((key, visibleIndex) => {
                const realIndex = Math.max(0, index - 6) + visibleIndex;
                return <span key={`${realIndex}-${key}`} className={realIndex < index ? 'done' : realIndex === index ? 'current' : ''}>{key === ' ' ? '·' : key}</span>;
              })}
            </div>

            <AcademyKeyboard activeKey={activeKey} activeFinger={activeFinger} onKey={enterKey} />

            <label className="academy-input-label">
              <span>TYPE HERE · PHYSICAL OR ON-SCREEN KEYBOARD</span>
              <input
                ref={inputRef}
                className="academy-input-capture"
                value=""
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Tap here, then type the highlighted key"
                aria-label={`Type ${displayAcademyKey(activeKey)}`}
                onChange={(event) => captureInput(event.currentTarget.value)}
              />
            </label>
            <button className="text-button academy-refocus" onClick={() => inputRef.current?.focus()}>RETURN FOCUS TO DRILL</button>
          </div>
        )}

        {phase === 'summary' && summary && (
          <div className="academy-summary">
            <span className="academy-step">LESSON REVIEW · {lesson.shortTitle.toUpperCase()} · {activeStage.label.toUpperCase()}</span>
            <h2>{summary.passed ? stageIndex === lesson.stages.length - 1 ? 'Lesson mastered.' : 'Stage cleared.' : 'One more clean pass.'}</h2>
            <p>{summary.passed ? `You met both ${activeStage.label.toLowerCase()} standards: ${activeStage.passAccuracy}% accuracy and a ${activeStage.passStreak}-key clean streak.` : `Reach ${activeStage.passAccuracy}% accuracy with a ${activeStage.passStreak}-key clean streak to clear this stage.`}</p>
            <div className="academy-summary-grid">
              <span className={summary.accuracy >= activeStage.passAccuracy ? 'pass' : ''}><small>ACCURACY</small><b>{summary.accuracy.toFixed(1)}%</b></span>
              <span className={summary.longestStreak >= activeStage.passStreak ? 'pass' : ''}><small>BEST STREAK</small><b>{summary.longestStreak}</b></span>
              <span><small>RHYTHM</small><b>{Math.round(summary.rhythmScore)}</b></span>
              <span><small>KEYS/MIN</small><b>{Math.round(summary.keysPerMinute)}</b></span>
            </div>
            <section className="academy-weaknesses">
              <header><span>ADAPTIVE REVIEW</span><small>{summary.weakKeys.length ? 'MILES FOUND YOUR NEXT FOCUS' : 'NO REPEATED MISSES'}</small></header>
              {summary.weakKeys.length ? summary.weakKeys.map((weakKey) => (
                <div key={weakKey.key}><kbd>{displayAcademyKey(weakKey.key)}</kbd><span><b>{FINGER_LABELS[weakKey.finger]}</b><small>{weakKey.misses} {weakKey.misses === 1 ? 'miss' : 'misses'} · held until corrected</small></span></div>
              )) : <p>Clean key selection. On the next pass, preserve that accuracy while making your cadence more even.</p>}
            </section>
            <div className="academy-summary-actions">
              <button className="secondary-button" onClick={beginDrill}>REPEAT STAGE</button>
              <button className="primary-button" onClick={summary.passed ? continueAfterStage : showCatalog}>{summary.passed ? stageIndex < lesson.stages.length - 1 ? 'NEXT STAGE' : 'NEXT LESSON' : 'CHOOSE A LESSON'}</button>
            </div>
          </div>
        )}
      </section>

      <aside className="academy-disclaimer">
        <b>ACADEMY MVP</b>
        <span>Progress stays on this device. Technique guidance is instructional—not webcam analysis. Miles’ optimized 3D model will drop into this stage without changing the lessons or your progress.</span>
      </aside>
    </main>
  );
}

function AcademyCoachPreview() {
  return (
    <div className="academy-coach-3d" data-status="standby">
      <div className="academy-model-status academy-model-preview">
        <span aria-hidden="true">M</span>
        <b>MILES IS GETTING WEB-READY</b>
        <small>The complete lesson engine is active now. The optimized 3D coach will step onto this same stage when ready.</small>
      </div>
    </div>
  );
}

function AcademyKeyboard({ activeKey, activeFinger, onKey }: {
  activeKey: string;
  activeFinger: AcademyFinger;
  onKey: (key: string) => void;
}) {
  return (
    <div className="academy-keyboard" aria-label="Touch typing keyboard guide">
      {ACADEMY_KEYBOARD_ROWS.map((row, rowIndex) => (
        <div className={`academy-key-row row-${rowIndex + 1}`} key={row.join('')}>
          {row.map((key) => {
            const finger = academyFingerForKey(key);
            return <button
              type="button"
              key={key}
              className={`finger-${finger} ${key === activeKey ? 'active' : ''} ${finger === activeFinger ? 'finger-active' : ''}`}
              onClick={() => onKey(key)}
              aria-label={`${key.toUpperCase()}, ${FINGER_LABELS[finger]}`}
            >{key.toUpperCase()}</button>;
          })}
        </div>
      ))}
      <div className="academy-key-row row-space"><button type="button" className={`finger-thumbs ${activeKey === ' ' ? 'active' : ''}`} onClick={() => onKey(' ')} aria-label="Space, either thumb">SPACE</button></div>
    </div>
  );
}
