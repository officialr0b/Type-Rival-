'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Room } from '@colyseus/sdk';
import { getSupabaseBrowserClient } from '../lib/supabase-browser';
import { recordInputDiagnostic } from './input-diagnostics';
import {
  isNativeSwipeInputType,
  physicalKeyEdit,
  reconcileTypingValue,
  type MobileInputPreference,
} from '../lib/game';

type LivePlayer = {
  userId: string;
  handle: string;
  input: string;
  progress: number;
  wpm: number;
  accuracy: number;
  errors: number;
  totalTypedChars: number;
  finished: boolean;
  outcome: string;
};

type LiveSnapshot = {
  phase: 'waiting' | 'countdown' | 'racing' | 'finished';
  passage: string;
  startsAt: number;
  endsAt: number;
  players: Record<string, LivePlayer>;
};

const LIVE_SENTINEL = '\u200b';

function resetInput(field: HTMLTextAreaElement) {
  field.value = LIVE_SENTINEL;
  field.setSelectionRange(LIVE_SENTINEL.length, LIVE_SENTINEL.length);
}

function focusRaceInput(field: HTMLTextAreaElement | null) {
  if (!field) return;
  try {
    field.focus({ preventScroll: true });
  } catch {
    field.focus();
  }
}

export default function LiveFriendly({ initialRoomId, inputPreference, ageBand, signedIn, onInputPreference, onBack, onSignIn }: {
  initialRoomId: string;
  inputPreference: MobileInputPreference;
  ageBand: 'under13' | 'teen' | 'adult' | null;
  signedIn: boolean;
  onInputPreference: (preference: MobileInputPreference) => void;
  onBack: () => void;
  onSignIn: () => void;
}) {
  const endpoint = process.env.NEXT_PUBLIC_COLYSEUS_URL ?? '';
  const [roomCode, setRoomCode] = useState(initialRoomId);
  const [roomId, setRoomId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [status, setStatus] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState(0);
  const roomRef = useRef<Room | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const currentNativeInput = useRef('');
  const lastPhysicalEdit = useRef<{ inputType: string; data: string | null; at: number } | null>(null);
  const attemptedInitialRoom = useRef(false);

  const players = useMemo(() => Object.entries(snapshot?.players ?? {}), [snapshot?.players]);
  const localPlayer = snapshot?.players?.[sessionId];
  const remaining = snapshot?.phase === 'racing' ? Math.max(0, snapshot.endsAt - now) : 45_000;
  const countdown = snapshot?.phase === 'countdown' ? Math.max(1, Math.ceil((snapshot.startsAt - now) / 1_000)) : 0;

  const syncState = useCallback((state: unknown) => {
    const serializable = state && typeof state === 'object' && 'toJSON' in state
      ? (state as { toJSON: () => LiveSnapshot }).toJSON()
      : state as LiveSnapshot;
    setSnapshot(serializable);
  }, []);

  const bindRoom = useCallback((room: Room) => {
    roomRef.current = room;
    setConnected(true);
    setRoomId(room.roomId);
    setSessionId(room.sessionId);
    syncState(room.state);
    room.onStateChange(syncState);
    room.onError((_code, message) => setStatus(message || 'The live room reported an error.'));
    room.onLeave(() => {
      roomRef.current = null;
      setConnected(false);
      setStatus((current) => current || 'The live room closed.');
    });
    const url = new URL(window.location.href);
    url.searchParams.set('live', room.roomId);
    window.history.replaceState({}, '', `${url.pathname}?${url.searchParams.toString()}`);
  }, [syncState]);

  const connect = useCallback(async (targetRoomId?: string) => {
    if (!endpoint || connecting || roomRef.current) return;
    const supabase = getSupabaseBrowserClient();
    const sessionResult = await supabase?.auth.getSession();
    const session = sessionResult?.data.session;
    if (!session) {
      onSignIn();
      return;
    }
    if (ageBand !== 'teen' && ageBand !== 'adult') {
      setStatus('Live Friendly is available for signed-in players 13 and older.');
      return;
    }
    setConnecting(true);
    setStatus('');
    try {
      const { Client } = await import('@colyseus/sdk');
      const client = new Client(endpoint);
      client.auth.token = session.access_token;
      const options = { inputPreference, ageBand };
      const room = targetRoomId
        ? await client.joinById(targetRoomId.trim(), options)
        : await client.create('live_friendly', options);
      bindRoom(room);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The live room could not connect.');
    } finally {
      setConnecting(false);
    }
  }, [ageBand, bindRoom, connecting, endpoint, inputPreference, onSignIn]);

  useEffect(() => {
    if (!initialRoomId || !endpoint || !ageBand || !signedIn || attemptedInitialRoom.current || roomRef.current) return;
    attemptedInitialRoom.current = true;
    void connect(initialRoomId);
  }, [ageBand, connect, endpoint, initialRoomId, signedIn]);

  useEffect(() => () => { void roomRef.current?.leave(true); }, []);

  useEffect(() => {
    if (snapshot?.phase !== 'countdown' && snapshot?.phase !== 'racing') return;
    const initialTimer = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 50);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [snapshot?.phase]);

  useEffect(() => {
    const field = inputRef.current;
    if (!field || snapshot?.phase !== 'racing') return;
    currentNativeInput.current = '';
    if (inputPreference === 'swipe') field.value = currentNativeInput.current;
    else resetInput(field);
    focusRaceInput(field);
    const beforeInput = (event: InputEvent) => {
      recordInputDiagnostic('live:before', event, field);
      if (inputPreference === 'swipe') {
        if (!isNativeSwipeInputType(event.inputType) && event.cancelable) event.preventDefault();
        return;
      }
      event.preventDefault();
      resetInput(field);
      const physical = lastPhysicalEdit.current;
      if (physical && performance.now() - physical.at < 120 && physical.inputType === event.inputType && physical.data === event.data) {
        lastPhysicalEdit.current = null;
        return;
      }
      roomRef.current?.send('edit', { inputType: event.inputType, data: event.data });
    };
    const input = (event: Event) => {
      recordInputDiagnostic('live:after', event, field);
      if (inputPreference !== 'swipe') {
        resetInput(field);
        return;
      }
      const inputEvent = event as InputEvent;
      const inputType = typeof inputEvent.inputType === 'string' ? inputEvent.inputType : '';
      if (!isNativeSwipeInputType(inputType)) {
        field.value = currentNativeInput.current;
        field.setSelectionRange(field.value.length, field.value.length);
        return;
      }
      const edit = reconcileTypingValue(currentNativeInput.current, field.value, (snapshot?.passage.length ?? 0) + 20);
      if (edit.value === currentNativeInput.current) return;
      currentNativeInput.current = edit.value;
      roomRef.current?.send('edit', { inputType, data: inputEvent.data, value: edit.value });
    };
    const keyDown = (event: KeyboardEvent) => {
      recordInputDiagnostic('live:key', event, field);
      if (inputPreference === 'swipe') return;
      const edit = physicalKeyEdit(event.key, event);
      if (!edit) return;
      event.preventDefault();
      resetInput(field);
      lastPhysicalEdit.current = { ...edit, at: performance.now() };
      roomRef.current?.send('edit', edit);
    };
    const composition = (event: CompositionEvent) => recordInputDiagnostic(`live:${event.type}`, event, field);
    field.addEventListener('beforeinput', beforeInput);
    field.addEventListener('input', input);
    field.addEventListener('keydown', keyDown);
    field.addEventListener('compositionstart', composition);
    field.addEventListener('compositionupdate', composition);
    field.addEventListener('compositionend', composition);
    return () => {
      field.removeEventListener('beforeinput', beforeInput);
      field.removeEventListener('input', input);
      field.removeEventListener('keydown', keyDown);
      field.removeEventListener('compositionstart', composition);
      field.removeEventListener('compositionupdate', composition);
      field.removeEventListener('compositionend', composition);
    };
  }, [inputPreference, snapshot?.passage, snapshot?.phase]);

  const shareRoom = async () => {
    const url = `${window.location.origin}/?live=${encodeURIComponent(roomId)}`;
    if (navigator.share) await navigator.share({ title: 'TypeRival Live Friendly', text: 'Race me live on TypeRival.', url });
    else {
      await navigator.clipboard.writeText(url);
      setStatus('Live invite copied.');
    }
  };

  if (!endpoint) {
    return <main className="live-page"><button className="back-button" onClick={onBack}>← BACK HOME</button><section className="live-unavailable"><span className="eyebrow">COLYSEUS · LIVE FRIENDLY ALPHA</span><h1>The arena is staged.</h1><p>The real-time service still needs its production address. Existing Friendly challenges and Ranked runs remain available.</p></section></main>;
  }

  if (!connected) {
    return <main className="live-page">
      <button className="back-button" onClick={onBack}>← BACK HOME</button>
      <section className="live-lobby">
        <div><span className="eyebrow">COLYSEUS · LIVE FRIENDLY ALPHA</span><h1>Same clock. Same moment.</h1><p>Create a private 45-second room or enter the code a rival sent you. Alpha races do not change rating or XP yet.</p></div>
        <div className="live-connect-card">
          <div className="input-method-control"><span><small>INPUT STYLE</small><b>Choose your style before joining.</b></span><div role="group" aria-label="Live input method"><button className={inputPreference === 'tap' ? 'selected' : ''} aria-pressed={inputPreference === 'tap'} onClick={() => onInputPreference('tap')}><b>TAP</b><small>ONE KEY AT A TIME</small></button><button className={inputPreference === 'swipe' ? 'selected' : ''} aria-pressed={inputPreference === 'swipe'} onClick={() => onInputPreference('swipe')}><b>SWIPE</b><small>WORD GESTURES</small></button></div></div>
          <button className="primary-button" onClick={() => signedIn ? void connect() : onSignIn()} disabled={connecting}>{connecting ? 'OPENING ROOM…' : signedIn ? 'CREATE PRIVATE ROOM' : 'SIGN IN TO CREATE A ROOM'}</button>
          <span>OR JOIN WITH A ROOM CODE</span>
          <div><input value={roomCode} onChange={(event) => setRoomCode(event.target.value)} placeholder="ROOM CODE" aria-label="Live room code" /><button className="secondary-button" onClick={() => signedIn ? void connect(roomCode) : onSignIn()} disabled={connecting || !roomCode.trim()}>{signedIn ? 'JOIN' : 'SIGN IN'}</button></div>
          {status && <p className="inline-error" role="alert">{status}</p>}
        </div>
      </section>
    </main>;
  }

  return <main className="live-race game-page" onClick={() => focusRaceInput(inputRef.current)}>
    <header className="race-top"><button onClick={() => { void roomRef.current?.leave(true); onBack(); }}>✕ EXIT</button><span>LIVE FRIENDLY · {roomId}</span><small>COLYSEUS ALPHA</small></header>
    <section className="live-player-strip">{players.map(([id, player]) => <article key={id} className={id === sessionId ? 'you' : ''}><span>{id === sessionId ? 'YOU' : 'RIVAL'}</span><b>{player.handle}</b><strong>{Math.round(player.wpm)} WPM</strong><div><i style={{ width: `${player.progress}%` }} /></div></article>)}</section>
    <section className="race-hud"><RaceValue value={Math.round(localPlayer?.wpm ?? 0)} label="NET WPM" /><RaceValue value={`${(localPlayer?.accuracy ?? 100).toFixed(1)}%`} label="ACCURACY" /><div className="race-clock"><b>{snapshot?.phase === 'racing' ? Math.ceil(remaining / 1_000) : 45}</b><small>SECONDS</small></div><RaceValue value={localPlayer?.errors ?? 0} label="ERRORS" /><RaceValue value={`${Math.round(localPlayer?.progress ?? 0)}%`} label="PROGRESS" /></section>
    <section className="passage-card">
      {snapshot?.phase === 'waiting' && <div className="countdown ready-prompt"><small>PRIVATE ROOM · {roomId}</small><b>INVITE A RIVAL</b><span>The countdown begins automatically when player two connects.</span><button className="primary-button" onClick={() => void shareRoom()}>SHARE LIVE INVITE ↗</button></div>}
      {snapshot?.phase === 'countdown' && <div className="countdown"><small>RIVAL CONNECTED</small><b>{countdown}</b><span>Both clocks start together.</span></div>}
      {(snapshot?.phase === 'racing' || snapshot?.phase === 'finished') && <div className="passage-wrap"><p>{Array.from(snapshot.passage).map((character, index) => { const actual = Array.from(localPlayer?.input ?? ''); const state = index >= actual.length ? 'pending' : actual[index] === character ? 'correct' : 'incorrect'; return <span key={index} className={`${state} ${index === actual.length ? 'current' : ''}`}>{character}</span>; })}</p><div className="progress-track"><span style={{ width: `${localPlayer?.progress ?? 0}%` }} /></div></div>}
      {snapshot?.phase === 'finished' && <div className="live-finish"><span>{localPlayer?.outcome?.toUpperCase()}</span><b>{Math.round(localPlayer?.wpm ?? 0)} WPM</b><small>Live Alpha results are session-only while we validate stability and fairness.</small></div>}
    </section>
    <div className={`race-input-shell ${inputPreference === 'swipe' ? 'native-swipe' : ''}`}>
      <textarea id="live-race-typing-input" ref={inputRef} className={`race-input ${inputPreference === 'swipe' ? 'race-input-native' : 'race-input-proxy'}`} defaultValue={inputPreference === 'swipe' ? '' : LIVE_SENTINEL} onFocus={(event) => { if (inputPreference !== 'swipe') resetInput(event.currentTarget); }} onPaste={(event) => event.preventDefault()} onDrop={(event) => event.preventDefault()} autoComplete="off" autoCorrect={inputPreference === 'swipe' ? 'on' : 'off'} autoCapitalize={inputPreference === 'swipe' ? 'sentences' : 'none'} inputMode="text" enterKeyHint="done" rows={1} wrap="off" spellCheck={inputPreference === 'swipe'} aria-label="Live race typing input" />
    </div>
    {status && <div className="toast" role="status">{status}</div>}
  </main>;
}

function RaceValue({ value, label }: { value: string | number; label: string }) {
  return <span className="race-metric"><b>{value}</b><small>{label}</small></span>;
}
