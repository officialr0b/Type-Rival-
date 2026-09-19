'use client';

import { useMemo, useRef, useState } from 'react';
import {
  STENO_KEY_ROWS,
  STENO_LESSONS,
  STENO_STORAGE_KEY,
  calculateStenoSummary,
  emptyStenoProgress,
  firstIncompleteStenoStage,
  normalizeStenoText,
  parseStenoProgress,
  recordStenoStage,
  type StenoLesson,
  type StenoProgress,
  type StenoSummary,
} from '../lib/steno-academy';

type StenoPhase = 'catalog' | 'briefing' | 'drill' | 'summary';

function loadProgress(): StenoProgress {
  if (typeof window === 'undefined') return emptyStenoProgress();
  return parseStenoProgress(window.localStorage.getItem(STENO_STORAGE_KEY));
}

export default function StenoAcademy({ onBack, onSwitchTrack }: { onBack: () => void; onSwitchTrack: () => void }) {
  const [phase, setPhase] = useState<StenoPhase>('catalog');
  const [lesson, setLesson] = useState<StenoLesson>(STENO_LESSONS[0]);
  const [stageIndex, setStageIndex] = useState(0);
  const [setupChecks, setSetupChecks] = useState<boolean[]>([]);
  const [input, setInput] = useState('');
  const [corrections, setCorrections] = useState(0);
  const [summary, setSummary] = useState<StenoSummary | null>(null);
  const [progress, setProgress] = useState<StenoProgress>(loadProgress);
  const [coachLine, setCoachLine] = useState('Choose a stenography lesson and connect your writer when you are ready.');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const startedAtRef = useRef(0);
  const previousInputRef = useRef('');

  const activeStage = lesson.stages[stageIndex] ?? lesson.stages[0]!;
  const completedLessons = useMemo(
    () => STENO_LESSONS.filter((item) => progress.lessons[item.id]?.completed).length,
    [progress],
  );
  const completedStages = useMemo(
    () => STENO_LESSONS.reduce((total, item) => total + (progress.lessons[item.id]?.completedStages.length ?? 0), 0),
    [progress],
  );
  const totalStages = STENO_LESSONS.reduce((total, item) => total + item.stages.length, 0);
  const selectedChecks = setupChecks.filter(Boolean).length;

  const chooseLesson = (nextLesson: StenoLesson) => {
    setLesson(nextLesson);
    setStageIndex(firstIncompleteStenoStage(nextLesson, progress.lessons[nextLesson.id]));
    setSetupChecks(nextLesson.setupChecks.map(() => false));
    setInput('');
    setSummary(null);
    setCoachLine(nextLesson.coachIntro);
    setPhase('briefing');
  };

  const showCatalog = () => {
    setPhase('catalog');
    setInput('');
    setSummary(null);
    setCoachLine('Choose a stenography lesson and connect your writer when you are ready.');
  };

  const beginDrill = () => {
    setInput('');
    previousInputRef.current = '';
    setCorrections(0);
    setSummary(null);
    startedAtRef.current = performance.now();
    setCoachLine('Write the highlighted copy with your steno writer. Your theory and dictionary stay in control.');
    setPhase('drill');
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const finishDrill = (finalInput: string, finalCorrections = corrections) => {
    if (!finalInput.trim()) return;
    const result = calculateStenoSummary({
      target: activeStage.drill,
      input: finalInput,
      elapsedMs: Math.max(1_000, performance.now() - startedAtRef.current),
      corrections: finalCorrections,
      stage: activeStage,
    });
    setSummary(result);
    setCoachLine(result.passed
      ? stageIndex === lesson.stages.length - 1
        ? 'This lesson is complete. Keep the same discipline when the material and speed change.'
        : `${activeStage.label} cleared. Review the notes, then add the next layer.`
      : 'Review the first mismatch and your paper tape or suggestions. Fix the cause before raising speed.');
    setProgress((current) => {
      const next = recordStenoStage(current, lesson, activeStage, result, new Date().toISOString());
      window.localStorage.setItem(STENO_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    setPhase('summary');
  };

  const updateInput = (value: string) => {
    const bounded = Array.from(value).slice(0, activeStage.drill.length + 80).join('');
    const previous = previousInputRef.current;
    const changedEarlier = previous.length > 0 && !bounded.startsWith(previous);
    const nextCorrections = changedEarlier || bounded.length < previous.length ? corrections + 1 : corrections;
    if (nextCorrections !== corrections) setCorrections(nextCorrections);
    previousInputRef.current = bounded;
    setInput(bounded);
    if (normalizeStenoText(bounded) === normalizeStenoText(activeStage.drill)) {
      window.requestAnimationFrame(() => finishDrill(bounded, nextCorrections));
    }
  };

  const continueAfterStage = () => {
    if (stageIndex < lesson.stages.length - 1) {
      setStageIndex((current) => current + 1);
      setSetupChecks(lesson.setupChecks.map(() => false));
      setInput('');
      setSummary(null);
      setCoachLine(`Next up: ${lesson.stages[stageIndex + 1]!.title}.`);
      setPhase('briefing');
      return;
    }
    const nextLesson = STENO_LESSONS.find((item) => item.order === lesson.order + 1) ?? STENO_LESSONS[0];
    chooseLesson(nextLesson);
  };

  const expectedCharacters = Array.from(activeStage.drill);
  const inputCharacters = Array.from(normalizeStenoText(input));
  const liveAccuracy = inputCharacters.length === 0
    ? 100
    : inputCharacters.reduce((total, character, index) => total + (character === expectedCharacters[index] ? 1 : 0), 0) / inputCharacters.length * 100;

  return (
    <main className="academy-page steno-academy-page">
      <header className="academy-heading">
        <div>
          <button className="back-button" onClick={phase === 'catalog' ? onBack : showCatalog}>← {phase === 'catalog' ? 'BACK HOME' : 'ALL STENO LESSONS'}</button>
          <span className="eyebrow">TYPE RIVAL ACADEMY · STENOGRAPHY</span>
          <h1>Write the sound.<br/><i>Build realtime.</i></h1>
          <p>An 18-stage writer path covering equipment, keyboard anatomy, theory discipline, dictionaries, professional material, and accuracy-first speedbuilding.</p>
          <AcademyTrackSwitch active="steno" onTyping={onSwitchTrack} />
        </div>
        <div className="academy-overview" aria-label="Stenography Academy progress">
          <span><small>MASTERY</small><b>{completedStages}/{totalStages}</b><em>stages cleared</em></span>
          <span><small>LESSONS</small><b>{completedLessons}/{STENO_LESSONS.length}</b><em>fully mastered</em></span>
          <span><small>DRILLS</small><b>{progress.totalDrills}</b><em>completed here</em></span>
        </div>
      </header>

      <section className={`academy-workspace phase-${phase}`} aria-live="polite">
        <aside className="academy-coach-panel steno-coach-panel">
          <div className="academy-coach-3d">
            <div className="steno-coach-visual" aria-hidden="true">
              <span>STKPWHR</span><b>AO*EU</b><span>FRPBLGTSDZ</span>
            </div>
          </div>
          <div className="academy-coach-caption">
            <span><b>MILES</b><small>STENO COACH · TRANSLATION READY</small></span>
            <p>{coachLine}</p>
          </div>
        </aside>

        {phase === 'catalog' && (
          <div className="academy-catalog">
            <div className="academy-section-title"><span>18-STAGE STENO PATH</span><small>EQUIPMENT · THEORY · REALTIME</small></div>
            <section className="steno-foundation-note">
              <span>BUILT AROUND THE REAL TRAINING STACK</span>
              <p>TypeRival supplements formal instruction. It grades translated output from your writer and software; it does not prescribe one theory, certify professional readiness, or replace instructor-reviewed dictation and transcripts.</p>
              <div><a href="https://www.openstenoproject.org/" target="_blank" rel="noreferrer">OPEN STENO + PLOVER ↗</a><a href="https://www.ncra.org/home/start-your-career/discoversteno-program/ncra-a-to-z-online-program" target="_blank" rel="noreferrer">NCRA A TO Z ↗</a><a href="https://www.ncra.org/certification/NCRA-Certifications/registered-professional-reporter" target="_blank" rel="noreferrer">RPR SKILLS STANDARDS ↗</a></div>
            </section>
            <div className="academy-lesson-grid">
              {STENO_LESSONS.map((item) => {
                const saved = progress.lessons[item.id];
                const stagesComplete = saved?.completedStages.length ?? 0;
                const finalStage = item.stages[item.stages.length - 1]!;
                return <article key={item.id} className={saved?.completed ? 'complete' : ''}>
                  <div className="academy-lesson-meta"><span>{String(item.order).padStart(2, '0')}</span><em>{saved?.completed ? 'MASTERED' : `${stagesComplete}/${item.stages.length} STAGES`}</em></div>
                  <small className="steno-lesson-level">{item.level.toUpperCase()}</small>
                  <h2>{item.title}</h2>
                  <p>{item.description}</p>
                  <dl>
                    <div><dt>TIME</dt><dd>{item.duration}</dd></div>
                    <div><dt>TARGET</dt><dd>{finalStage.passAccuracy}% accuracy</dd></div>
                    <div><dt>BEST</dt><dd>{saved ? `${saved.bestAccuracy.toFixed(1)}%` : '—'}</dd></div>
                  </dl>
                  <button aria-label={`${saved ? 'Continue' : 'Start'} ${item.title} stenography lesson`} className={item.order === 1 && !saved ? 'primary-button' : 'secondary-button'} onClick={() => chooseLesson(item)}>{saved?.completed ? 'PRACTICE PEAK STAGE' : saved ? 'CONTINUE LESSON' : 'START LESSON'}</button>
                </article>;
              })}
            </div>
          </div>
        )}

        {phase === 'briefing' && (
          <div className="academy-briefing steno-briefing">
            <span className="academy-step">STENO {String(lesson.order).padStart(2, '0')} · STAGE {stageIndex + 1} OF {lesson.stages.length} · {activeStage.label.toUpperCase()}</span>
            <h2>{lesson.title}</h2>
            <div className="academy-stage-brief"><b>{activeStage.title}</b><p>{activeStage.goal}</p></div>
            <StenoKeyboard focus={activeStage.focusStrokes} />
            <section className="steno-knowledge">
              <header><span>WHY THIS MATTERS</span><small>FIELD FOUNDATION</small></header>
              <ul>{lesson.knowledge.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
            <div className="academy-setup-instruction" role="note"><span>STEP 1 OF 2</span><b>Check all three writer cues.</b><p>Confirm the physical and software setup before the translated-output drill.</p></div>
            <fieldset>
              <legend>WRITER CHECK · {selectedChecks}/{lesson.setupChecks.length} SELECTED</legend>
              {lesson.setupChecks.map((check, index) => <label key={check}>
                <input type="checkbox" checked={Boolean(setupChecks[index])} onChange={(event) => setSetupChecks((current) => current.map((value, valueIndex) => valueIndex === index ? event.target.checked : value))} />
                <span><b>{index + 1}</b>{check}</span>
              </label>)}
            </fieldset>
            <div className={`academy-start-step ${setupChecks.every(Boolean) ? 'ready' : ''}`} aria-live="polite"><span>STEP 2 OF 2</span><b>{setupChecks.every(Boolean) ? 'Writer ready—focus the field and begin.' : `Select ${lesson.setupChecks.length - selectedChecks} more ${lesson.setupChecks.length - selectedChecks === 1 ? 'cue' : 'cues'}.`}</b></div>
            <button className="primary-button academy-begin" onClick={beginDrill} disabled={!setupChecks.every(Boolean)}>BEGIN {activeStage.label.toUpperCase()} DRILL</button>
          </div>
        )}

        {phase === 'drill' && (
          <div className="academy-drill steno-drill">
            <header>
              <span><small>{activeStage.label.toUpperCase()} · {stageIndex + 1}/{lesson.stages.length}</small><b>{lesson.shortTitle}</b></span>
              <span><small>LIVE ACCURACY</small><b>{liveAccuracy.toFixed(1)}%</b></span>
              <span><small>CORRECTIONS</small><b>{corrections}</b></span>
              <span><small>TRANSLATED</small><b>{Math.min(inputCharacters.length, expectedCharacters.length)}/{expectedCharacters.length}</b></span>
            </header>
            <StenoKeyboard focus={activeStage.focusStrokes} />
            <div className="steno-copy" aria-label={`Stenography drill: ${activeStage.drill}`}>
              <small>TRANSLATE THIS COPY</small>
              <p>{expectedCharacters.map((character, index) => {
                const state = index >= inputCharacters.length ? 'pending' : inputCharacters[index] === character ? 'correct' : 'incorrect';
                return <span key={index} className={`${state} ${index === inputCharacters.length ? 'current' : ''}`}>{character}</span>;
              })}</p>
            </div>
            <label className="academy-input-label steno-input-label">
              <span>WRITER / PLOVER / CAT OUTPUT</span>
              <textarea ref={inputRef} value={input} onChange={(event) => updateInput(event.currentTarget.value)} onPaste={(event) => event.preventDefault()} onDrop={(event) => event.preventDefault()} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} rows={3} placeholder="Focus here, then write the copy on your steno machine" aria-label="Stenography translated output" />
            </label>
            <div className="steno-drill-actions"><button className="text-button" onClick={() => inputRef.current?.focus()}>RETURN FOCUS TO WRITER</button><button className="secondary-button" onClick={() => finishDrill(input)} disabled={!input.trim()}>CHECK CURRENT RUN</button></div>
          </div>
        )}

        {phase === 'summary' && summary && (
          <div className="academy-summary">
            <span className="academy-step">STENO REVIEW · {lesson.shortTitle.toUpperCase()} · {activeStage.label.toUpperCase()}</span>
            <h2>{summary.passed ? stageIndex === lesson.stages.length - 1 ? 'Lesson mastered.' : 'Stage cleared.' : 'Review before adding speed.'}</h2>
            <p>{summary.passed ? `You met the ${activeStage.passAccuracy}% accuracy and ${activeStage.passCleanWords}-clean-word standards.` : `Reach ${activeStage.passAccuracy}% accuracy with ${activeStage.passCleanWords} clean words to clear this stage.`}</p>
            <div className="academy-summary-grid">
              <span className={summary.accuracy >= activeStage.passAccuracy ? 'pass' : ''}><small>ACCURACY</small><b>{summary.accuracy.toFixed(1)}%</b></span>
              <span className={summary.cleanWords >= activeStage.passCleanWords ? 'pass' : ''}><small>CLEAN WORDS</small><b>{summary.cleanWords}</b></span>
              <span><small>TRANSLATED WPM</small><b>{Math.round(summary.translatedWpm)}</b></span>
              <span><small>CORRECTIONS</small><b>{summary.corrections}</b></span>
            </div>
            <section className="academy-weaknesses steno-review">
              <header><span>REVIEW LOOP</span><small>TRANSLATION → OUTLINE → CAUSE</small></header>
              <p>{summary.passed ? 'Save any new dictionary decision, then repeat on unfamiliar copy before increasing speed.' : 'Find the first mismatch in your translated text. Inspect the corresponding steno notes or paper tape, decide whether the cause was theory, execution, or dictionary, and repeat cleanly.'}</p>
            </section>
            <div className="academy-summary-actions"><button className="secondary-button" onClick={beginDrill}>REPEAT STAGE</button><button className="primary-button" onClick={summary.passed ? continueAfterStage : showCatalog}>{summary.passed ? stageIndex < lesson.stages.length - 1 ? 'NEXT STAGE' : 'NEXT LESSON' : 'CHOOSE A LESSON'}</button></div>
          </div>
        )}
      </section>

      <aside className="academy-disclaimer"><b>STENOGRAPHY ACADEMY · BETA</b><span>Progress stays on this device. TypeRival accepts translated writer output and uses theory-neutral coaching. It is supplemental practice, not professional certification or an accredited court-reporting program.</span></aside>
    </main>
  );
}

function AcademyTrackSwitch({ active, onTyping }: { active: 'steno'; onTyping: () => void }) {
  return <nav className="academy-track-switch" aria-label="Academy learning track">
    <button onClick={onTyping}>TOUCH TYPING</button>
    <button className={active === 'steno' ? 'selected' : ''} aria-current="page">STENOGRAPHY</button>
  </nav>;
}

function StenoKeyboard({ focus }: { focus: string[] }) {
  return <div className="steno-keyboard-block">
    <div className="steno-focus-list">{focus.map((item) => <kbd key={item}>{item}</kbd>)}</div>
    <div className="steno-keyboard" aria-label="Standard English stenotype keyboard order">
      {STENO_KEY_ROWS.map((row, index) => <div key={row.join('-')} className={`steno-key-row steno-key-row-${index + 1}`}>{row.map((key, keyIndex) => <span key={`${key}-${keyIndex}`}>{key}</span>)}</div>)}
    </div>
    <small>STANDARD ENGLISH STENO ORDER · YOUR THEORY MAY ASSIGN DIFFERENT OUTLINES</small>
  </div>;
}
