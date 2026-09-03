'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  PASSAGE_CATEGORIES,
  SUPPORTED_LANGUAGES,
  isPassageCategory,
  isTypingLanguage,
  normalizeTypingInput,
  type GameMode,
  type Passage,
  type PassageCategory,
  type TypingLanguage,
} from '../lib/game';
import type { AgeBand } from '../lib/age';
import { authFetch } from '../lib/supabase-browser';

type Submission = {
  id: string;
  title: string;
  language: TypingLanguage;
  category: PassageCategory;
  status: 'pending' | 'approved' | 'rejected';
  moderatorNote?: string | null;
  createdAt: string;
};

type Draft = {
  title: string;
  text: string;
  language: TypingLanguage;
  category: PassageCategory;
  sourceName: string;
  sourceUrl: string;
};

const EMPTY_DRAFT: Draft = {
  title: '',
  text: '',
  language: 'en',
  category: 'science',
  sourceName: '',
  sourceUrl: '',
};

const PRIVATE_PASSAGES_KEY = 'typerival-private-passages-v1';

export default function PassageStudio({ signedIn, ageBand, language, onLanguage, onBack, onCurated, onCustom, onSignIn }: {
  signedIn: boolean;
  ageBand: AgeBand | null;
  language: TypingLanguage;
  onLanguage: (language: TypingLanguage) => void;
  onBack: () => void;
  onCurated: (category: PassageCategory) => void;
  onCustom: (passage: Passage, mode: Extract<GameMode, 'practice' | 'friendly'>) => void;
  onSignIn: () => void;
}) {
  const [draft, setDraft] = useState<Draft>({ ...EMPTY_DRAFT, language });
  const [privatePassages, setPrivatePassages] = useState<Passage[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [rightsAttested, setRightsAttested] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setPrivatePassages(readPrivatePassages()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!signedIn) {
      const timer = window.setTimeout(() => setSubmissions([]), 0);
      return () => window.clearTimeout(timer);
    }
    let active = true;
    authFetch('/api/passages/submissions', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json() as { submissions?: Submission[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? 'Submission history is unavailable.');
        if (active) setSubmissions(data.submissions ?? []);
      })
      .catch((error) => { if (active) setStatus(error instanceof Error ? error.message : 'Submission history is unavailable.'); });
    return () => { active = false; };
  }, [signedIn]);

  const characterCount = useMemo(() => normalizeDraftText(draft.text).length, [draft.text]);

  const updateDraft = <Key extends keyof Draft>(key: Key, value: Draft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setStatus('');
  };

  const buildPassage = () => {
    const title = normalizeDraftText(draft.title);
    const text = normalizeDraftText(draft.text);
    if (title.length < 3 || title.length > 80) throw new Error('Give your passage a title between 3 and 80 characters.');
    if (text.length < 80 || text.length > 1_500) throw new Error('Custom passages must be between 80 and 1,500 characters.');
    if (draft.sourceUrl && !isSecureUrl(draft.sourceUrl)) throw new Error('Source links must begin with https://');
    const id = `custom-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
    return {
      id,
      title,
      text,
      language: draft.language,
      category: draft.category,
      sourceType: 'custom',
      learning: draft.sourceUrl ? {
        summary: 'Custom passage supplied by a TypeRival player. It has not been reviewed for accuracy.',
        sourceLabel: normalizeDraftText(draft.sourceName) || new URL(draft.sourceUrl).hostname.replace(/^www\./, ''),
        sourceUrl: new URL(draft.sourceUrl).href,
      } : undefined,
    } satisfies Passage;
  };

  const savePrivate = (passage = buildPassage()) => {
    const saved = [passage, ...privatePassages.filter((item) => item.text !== passage.text)].slice(0, 20);
    window.localStorage.setItem(PRIVATE_PASSAGES_KEY, JSON.stringify(saved));
    setPrivatePassages(saved);
    setStatus('Saved privately on this device.');
    return passage;
  };

  const playCustom = (mode: Extract<GameMode, 'practice' | 'friendly'>) => {
    try {
      if (mode === 'friendly' && (!signedIn || ageBand === 'under13')) {
        setStatus('Sign in with a 13+ account to create a custom friend challenge.');
        onSignIn();
        return;
      }
      const passage = savePrivate();
      onCustom(passage, mode);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'This passage is not ready yet.');
    }
  };

  const loadPrivate = (passage: Passage) => {
    setDraft({
      title: passage.title ?? 'My passage',
      text: passage.text,
      language: passage.language,
      category: passage.category,
      sourceName: passage.learning?.sourceLabel ?? '',
      sourceUrl: passage.learning?.sourceUrl ?? '',
    });
    setStatus('Private passage loaded into the editor.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deletePrivate = (id: string) => {
    const saved = privatePassages.filter((passage) => passage.id !== id);
    window.localStorage.setItem(PRIVATE_PASSAGES_KEY, JSON.stringify(saved));
    setPrivatePassages(saved);
    setStatus('Private passage removed from this device.');
  };

  const submitPublic = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!signedIn || ageBand === 'under13') {
      setStatus('Sign in with a 13+ account to submit to the public library.');
      onSignIn();
      return;
    }
    setBusy(true);
    setStatus('');
    try {
      const passage = buildPassage();
      if (passage.text.length < 120) throw new Error('Public submissions must be at least 120 characters.');
      const response = await authFetch('/api/passages/submissions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: passage.title,
          text: passage.text,
          language: passage.language,
          category: passage.category,
          sourceName: draft.sourceName,
          sourceUrl: draft.sourceUrl,
          rightsAttested,
          ageBand,
        }),
      });
      const data = await response.json() as { submission?: Submission; error?: string };
      if (!response.ok || !data.submission) throw new Error(data.error ?? 'The passage could not be submitted.');
      setSubmissions((current) => [data.submission!, ...current]);
      setRightsAttested(false);
      setStatus('Submitted for review. It will not enter the public library until approved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The passage could not be submitted.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="passage-studio-page legal-page">
      <button className="back-button" onClick={onBack}>← BACK HOME</button>
      <span className="eyebrow">PASSAGE STUDIO · LEARN WHILE YOU TYPE</span>
      <h1>Choose the subject. Own the words.</h1>
      <p className="studio-intro">Practice with reviewed learning passages, write something private, challenge a friend with your own text, or submit an original passage for the future public library.</p>

      <section className="studio-section curated-section">
        <div className="studio-heading"><div><small>01 · CURATED LIBRARY</small><h2>Pick a subject</h2><p>Reviewed passages earn normal Practice XP and can appear in verified play.</p></div>
          <label><span>PLAY LANGUAGE</span><select value={language} onChange={(event) => { if (isTypingLanguage(event.target.value)) onLanguage(event.target.value); }}>
            {SUPPORTED_LANGUAGES.map((option) => <option key={option.code} value={option.code}>{option.nativeLabel}</option>)}
          </select></label>
        </div>
        {language === 'en' ? (
          <div className="category-grid">
            {PASSAGE_CATEGORIES.filter((category) => category.code !== 'all' && category.code !== 'balanced').map((category) => (
              <button key={category.code} onClick={() => onCurated(category.code)}><span>{category.label}</span><small>START PRACTICE →</small></button>
            ))}
          </div>
        ) : <div className="studio-note"><b>More subjects are being translated.</b><span>{SUPPORTED_LANGUAGES.find((item) => item.code === language)?.nativeLabel} practice is live now with the full original-story rotation.</span><button className="secondary-button" onClick={() => onCurated('balanced')}>PRACTICE IN THIS LANGUAGE</button></div>}
      </section>

      <form className="studio-section studio-editor" onSubmit={(event) => void submitPublic(event)}>
        <div className="studio-heading"><div><small>02 · CREATE</small><h2>Your passage</h2><p>Private copies stay in this browser. Custom runs are clearly marked unverified.</p></div><span className={characterCount >= 80 && characterCount <= 1_500 ? 'count-ready' : ''}>{characterCount} / 1,500</span></div>
        <div className="studio-fields">
          <label className="studio-wide"><span>TITLE</span><input value={draft.title} maxLength={80} onChange={(event) => updateDraft('title', event.target.value)} placeholder="Example: How coral reefs grow" /></label>
          <label><span>LANGUAGE</span><select value={draft.language} onChange={(event) => { if (isTypingLanguage(event.target.value)) updateDraft('language', event.target.value); }}>{SUPPORTED_LANGUAGES.map((option) => <option key={option.code} value={option.code}>{option.nativeLabel}</option>)}</select></label>
          <label><span>CATEGORY</span><select value={draft.category} onChange={(event) => { if (isPassageCategory(event.target.value)) updateDraft('category', event.target.value); }}>{PASSAGE_CATEGORIES.filter((category) => category.code !== 'all').map((category) => <option key={category.code} value={category.code}>{category.label}</option>)}</select></label>
          <label className="studio-wide"><span>PASSAGE · 80–1,500 CHARACTERS</span><textarea value={draft.text} maxLength={1_500} onChange={(event) => updateDraft('text', event.target.value)} placeholder="Write or paste text you have permission to use. Autocorrect and paste are still blocked during the timed run." /></label>
          <label><span>SOURCE NAME <small>OPTIONAL</small></span><input value={draft.sourceName} maxLength={120} onChange={(event) => updateDraft('sourceName', event.target.value)} placeholder="NASA, your notes, a book…" /></label>
          <label><span>SOURCE LINK <small>OPTIONAL</small></span><input type="url" value={draft.sourceUrl} maxLength={500} onChange={(event) => updateDraft('sourceUrl', event.target.value)} placeholder="https://…" /></label>
        </div>
        <div className="studio-actions">
          <button className="primary-button" type="button" onClick={() => playCustom('practice')}>PRACTICE THIS</button>
          <button className="secondary-button" type="button" onClick={() => playCustom('friendly')}>CHALLENGE A FRIEND</button>
          <button className="text-button" type="button" onClick={() => { try { savePrivate(); } catch (error) { setStatus(error instanceof Error ? error.message : 'This passage is not ready yet.'); } }}>SAVE PRIVATELY</button>
        </div>
        <div className="submission-box">
          <div><small>PUBLIC LIBRARY REVIEW</small><b>Submit your passage to TypeRival</b><p>Every submission begins as pending. Approval does not happen automatically.</p></div>
          <label className="rights-check"><input type="checkbox" checked={rightsAttested} onChange={(event) => setRightsAttested(event.target.checked)} /><span>I wrote this passage or have permission to submit it, and it contains no private information.</span></label>
          <button className="secondary-button" type="submit" disabled={busy || !rightsAttested}>{busy ? 'SUBMITTING…' : signedIn ? 'SUBMIT FOR REVIEW' : 'SIGN IN TO SUBMIT'}</button>
        </div>
        {status && <div className="account-status" role="status">{status}</div>}
      </form>

      {(privatePassages.length > 0 || submissions.length > 0) && <section className="studio-section studio-library">
        <div className="studio-heading"><div><small>03 · YOUR LIBRARY</small><h2>Saved and submitted</h2></div></div>
        <div className="studio-library-grid">
          {privatePassages.map((item) => <article key={item.id}><em>PRIVATE · THIS DEVICE</em><h3>{item.title}</h3><p>{item.text.slice(0, 130)}{item.text.length > 130 ? '…' : ''}</p><div><button onClick={() => loadPrivate(item)}>EDIT</button><button onClick={() => deletePrivate(item.id)}>REMOVE</button></div></article>)}
          {submissions.map((item) => <article key={item.id}><em className={`submission-${item.status}`}>{item.status.toUpperCase()} · PUBLIC REVIEW</em><h3>{item.title}</h3><p>{item.moderatorNote || `${item.category} · ${new Date(item.createdAt).toLocaleDateString()}`}</p></article>)}
        </div>
      </section>}
    </main>
  );
}

function normalizeDraftText(value: string) {
  return normalizeTypingInput(value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

function isSecureUrl(value: string) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function readPrivatePassages(): Passage[] {
  try {
    const stored = JSON.parse(window.localStorage.getItem(PRIVATE_PASSAGES_KEY) ?? '[]') as unknown;
    if (!Array.isArray(stored)) return [];
    return stored.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const passage = entry as Passage;
      if (!passage.id?.startsWith('custom-') || passage.sourceType !== 'custom' || typeof passage.title !== 'string' || typeof passage.text !== 'string' || !isTypingLanguage(passage.language) || !isPassageCategory(passage.category)) return [];
      return [passage];
    }).slice(0, 20);
  } catch {
    return [];
  }
}
