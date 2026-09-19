'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Room } from '@colyseus/sdk';
import { getSupabaseBrowserClient } from '../lib/supabase-browser';
import { recordInputDiagnostic } from './input-diagnostics';
import {
  SUPPORTED_LANGUAGES,
  isNativeSwipeInputType,
  physicalKeyEdit,
  reconcileTypingValue,
  type MobileInputPreference,
  type TypingLanguage,
} from '../lib/game';

type LivePlayer = {
  handle: string;
  input: string;
  progress: number;
  wpm: number;
  accuracy: number;
  errors: number;
  totalTypedChars: number;
  finished: boolean;
  connected: boolean;
  outcome: string;
};

type LiveSnapshot = {
  phase: 'waiting' | 'countdown' | 'racing' | 'finished';
  language: TypingLanguage;
  passageId: string;
  passage: string;
  startsAt: number;
  endsAt: number;
  serverNow: number;
  finishedAt: number;
  finishReason: '' | 'time' | 'completed' | 'forfeit';
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

export default function PrivateRace({ initialRoomId, language, inputPreference, mobileViewer, ageBand, signedIn, onInputPreference, onBack, onSignIn }: {
  initialRoomId: string;
  language: TypingLanguage;
  inputPreference: MobileInputPreference;
  mobileViewer: boolean;
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
  const [reconnecting, setReconnecting] = useState(false);
  const [now, setNow] = useState(0);
  const roomRef = useRef<Room | null>(null);
  const connectingRef = useRef(false);
  const leavingRef = useRef(false);
  const clockOffsetRef = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const currentNativeInput = useRef('');
  const lastPhysicalEdit = useRef<{ inputType: string; data: string | null; at: number } | null>(null);
  const attemptedInitialRoom = useRef(false);

  const players = useMemo(() => Object.entries(snapshot?.players ?? {}), [snapshot?.players]);
  const localPlayer = snapshot?.players?.[sessionId];
  const rivalDisconnected = players.some(([id, player]) => id !== sessionId && player.connected === false);
  const remaining = snapshot?.phase === 'racing' ? Math.max(0, snapshot.endsAt - now) : 45_000;
  const countdown = snapshot?.phase === 'countdown' ? Math.max(1, Math.ceil((snapshot.startsAt - now) / 1_000)) : 0;
  const roomLanguage = SUPPORTED_LANGUAGES.find((option) => option.code === (snapshot?.language ?? language))?.label ?? 'English (US)';
  const nativeTranslationMode = inputPreference === 'swipe' || inputPreference === 'steno';

  const syncState = useCallback((state: unknown) => {
    const serializable = state && typeof state === 'object' && 'toJSON' in state
      ? (state as { toJSON: () => LiveSnapshot }).toJSON()
      : state as LiveSnapshot;
    if (serializable.serverNow > 0) clockOffsetRef.current = serializable.serverNow - Date.now();
    setNow(Date.now() + clockOffsetRef.current);
    setSnapshot(serializable);
  }, []);

  const bindRoom = useCallback((room: Room) => {
    room.reconnection.minUptime = 0;
    room.reconnection.maxRetries = 8;
    room.reconnection.delay = 100;
    room.reconnection.minDelay = 100;
    room.reconnection.maxDelay = 2_000;
    room.reconnection.maxEnqueuedMessages = 0;
    roomRef.current = room;
    leavingRef.current = false;
    setConnected(true);
    setReconnecting(false);
    setRoomId(room.roomId);
    setSessionId(room.sessionId);
    syncState(room.state);
    room.onStateChange(syncState);
    room.onError((_code, message) => setStatus(message || 'The private room reported an error.'));
    room.onDrop(() => {
      setReconnecting(true);
      setStatus('Connection interrupted. Rejoining your race…');
    });
    room.onReconnect(() => {
      setReconnecting(false);
      setStatus('Reconnected. Your race position was preserved.');
    });
    room.onLeave((_code, reason) => {
      if (roomRef.current === room) roomRef.current = null;
      setConnected(false);
      setReconnecting(false);
      if (!leavingRef.current) setStatus(reason || 'The private room closed. Create a new room or try the invite again.');
    });
    const url = new URL(window.location.href);
    url.searchParams.delete('live');
    url.searchParams.set('race', room.roomId);
    window.history.replaceState({}, '', `${url.pathname}?${url.searchParams.toString()}`);
  }, [syncState]);

  const connect = useCallback(async (targetRoomId?: string) => {
    if (!endpoint || connectingRef.current || roomRef.current) return;
    const normalizedRoomId = targetRoomId?.trim() ?? '';
    if (normalizedRoomId && !/^[A-Za-z0-9_-]{3,64}$/.test(normalizedRoomId)) {
      setStatus('That room code is not valid. Check the invite and try again.');
      return;
    }
    const supabase = getSupabaseBrowserClient();
    const sessionResult = await supabase?.auth.getSession();
    const session = sessionResult?.data.session;
    if (!session) {
      onSignIn();
      return;
    }
    if (ageBand !== 'teen' && ageBand !== 'adult') {
      setStatus('Private Race is available for signed-in players 13 and older.');
      return;
    }
    connectingRef.current = true;
    setConnecting(true);
    setStatus('');
    try {
      const { Client } = await import('@colyseus/sdk');
      const client = new Client(endpoint);
      client.auth.token = session.access_token;
      const options = { inputPreference, ageBand, language };
      const room = normalizedRoomId
        ? await client.joinById(normalizedRoomId, options)
        : await client.create('private_race', options);
      bindRoom(room);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The private room could not connect.');
    } finally {
      connectingRef.current = false;
      setConnecting(false);
    }
  }, [ageBand, bindRoom, endpoint, inputPreference, language, onSignIn]);

  useEffect(() => {
    if (!initialRoomId || !endpoint || !ageBand || !signedIn || attemptedInitialRoom.current || roomRef.current) return;
    attemptedInitialRoom.current = true;
    void connect(initialRoomId);
  }, [ageBand, connect, endpoint, initialRoomId, signedIn]);

  useEffect(() => () => {
    leavingRef.current = true;
    void roomRef.current?.leave(true);
  }, []);

  useEffect(() => {
    if (snapshot?.phase !== 'countdown' && snapshot?.phase !== 'racing') return;
    const readServerTime = () => setNow(Date.now() + clockOffsetRef.current);
    const initialTimer = window.setTimeout(readServerTime, 0);
    const timer = window.setInterval(readServerTime, 50);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [snapshot?.phase]);

  useEffect(() => {
    const field = inputRef.current;
    if (!field || snapshot?.phase !== 'racing' || reconnecting) return;
    currentNativeInput.current = '';
    if (nativeTranslationMode) field.value = currentNativeInput.current;
    else resetInput(field);
    focusRaceInput(field);
    const beforeInput = (event: InputEvent) => {
      recordInputDiagnostic('live:before', event, field);
      if (nativeTranslationMode) {
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
      if (!nativeTranslationMode) {
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
      if (nativeTranslationMode || snapshot?.phase !== 'racing' || reconnecting) return;
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
    window.addEventListener('keydown', keyDown, true);
    field.addEventListener('compositionstart', composition);
    field.addEventListener('compositionupdate', composition);
    field.addEventListener('compositionend', composition);
    return () => {
      field.removeEventListener('beforeinput', beforeInput);
      field.removeEventListener('input', input);
      window.removeEventListener('keydown', keyDown, true);
      field.removeEventListener('compositionstart', composition);
      field.removeEventListener('compositionupdate', composition);
      field.removeEventListener('compositionend', composition);
    };
  }, [nativeTranslationMode, reconnecting, snapshot?.passage, snapshot?.phase]);

  const shareRoom = async () => {
    const url = `${window.location.origin}/?race=${encodeURIComponent(roomId)}`;
    try {
      if (navigator.share) await navigator.share({ title: 'TypeRival Private Race', text: `Race me live in a 45-second ${roomLanguage} typing match.`, url });
      else {
        await navigator.clipboard.writeText(url);
        setStatus('Private Race invite copied.');
      }
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== 'AbortError') setStatus('The invite could not be shared. Try copying the page address.');
    }
  };

  const shareResult = async () => {
    const resultText = `${localPlayer?.outcome === 'win' ? 'I won' : localPlayer?.outcome === 'draw' ? 'I drew' : 'I raced'} a live TypeRival Private Race at ${Math.round(localPlayer?.wpm ?? 0)} WPM and ${(localPlayer?.accuracy ?? 100).toFixed(1)}% accuracy.`;
    try {
      if (navigator.share) await navigator.share({ title: 'My TypeRival Private Race', text: resultText, url: window.location.origin });
      else {
        await navigator.clipboard.writeText(`${resultText} ${window.location.origin}`);
        setStatus('Result copied.');
      }
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== 'AbortError') setStatus('The result could not be shared.');
    }
  };

  if (!endpoint) {
    return <main className="live-page"><button className="back-button" onClick={onBack}>← BACK HOME</button><section className="live-unavailable"><span className="eyebrow">COLYSEUS · PRIVATE RACE ALPHA</span><h1>The arena is staged.</h1><p>The real-time service still needs its production address. Challenge Links and Ranked Time Trials remain available.</p></section></main>;
  }

  if (!connected) {
    return <main className="live-page">
      <button className="back-button" onClick={onBack}>← BACK HOME</button>
      <section className="live-lobby">
        <div><span className="eyebrow">COLYSEUS · PRIVATE RACE ALPHA</span><h1>Same clock. Same moment.</h1><p>Create a private 45-second room or enter the code a rival sent you. The room uses your selected language. Alpha races do not change rating or XP yet.</p></div>
        <div className="live-connect-card">
          <div className="input-method-control">
            <span><small>INPUT STYLE</small><b>Choose your style before joining.</b></span>
            <div role="group" aria-label="Live input method">
              <button className={inputPreference === 'tap' ? 'selected' : ''} aria-pressed={inputPreference === 'tap'} onClick={() => onInputPreference('tap')}><b>{mobileViewer ? 'TAP' : 'KEYBOARD'}</b><small>{mobileViewer ? 'ONE KEY AT A TIME' : 'STANDARD QWERTY INPUT'}</small></button>
              {mobileViewer && <button className={inputPreference === 'swipe' ? 'selected' : ''} aria-pressed={inputPreference === 'swipe'} onClick={() => onInputPreference('swipe')}><b>SWIPE</b><small>WORD GESTURES</small></button>}
              <button className={inputPreference === 'steno' ? 'selected' : ''} aria-pressed={inputPreference === 'steno'} onClick={() => onInputPreference('steno')}><b>STENO</b><small>WRITER / PLOVER / CAT</small></button>
            </div>
            {inputPreference === 'steno' && <p>Focus the race field, then write through your translation software. Private Race receives translated text, not raw strokes.</p>}
          </div>
          <button className="primary-button" onClick={() => signedIn ? void connect() : onSignIn()} disabled={connecting}>{connecting ? 'OPENING ROOM…' : signedIn ? 'CREATE PRIVATE ROOM' : 'SIGN IN TO CREATE A ROOM'}</button>
          <span>OR JOIN WITH A ROOM CODE</span>
          <div><input value={roomCode} onChange={(event) => setRoomCode(event.target.value.slice(0, 64))} placeholder="ROOM CODE" aria-label="Private Race room code" autoCapitalize="none" autoCorrect="off" spellCheck={false} /><button className="secondary-button" onClick={() => signedIn ? void connect(roomCode) : onSignIn()} disabled={connecting || !roomCode.trim()}>{signedIn ? 'JOIN' : 'SIGN IN'}</button></div>
          {status && <p className="inline-error" role="alert">{status}</p>}
        </div>
      </section>
    </main>;
  }

  return <main className="live-race race-page game-page" onClick={() => focusRaceInput(inputRef.current)}>
    <header className="race-top"><button onClick={() => { leavingRef.current = true; void roomRef.current?.leave(true); onBack(); }}>✕ EXIT</button><span>PRIVATE RACE · {roomLanguage.toUpperCase()}</span><small>{roomId}</small></header>
    <section className="live-player-strip">{players.map(([id, player]) => <article key={id} className={`${id === sessionId ? 'you' : ''} ${player.connected === false ? 'disconnected' : ''}`}><span>{id === sessionId ? 'YOU' : 'RIVAL'}{player.connected === false ? ' · RECONNECTING' : ''}</span><b>{player.handle}</b><strong>{Math.round(player.wpm)} WPM</strong><div><i style={{ width: `${player.progress}%` }} /></div></article>)}</section>
    <section className="race-hud"><RaceValue value={Math.round(localPlayer?.wpm ?? 0)} label="NET WPM" /><RaceValue value={`${(localPlayer?.accuracy ?? 100).toFixed(1)}%`} label="ACCURACY" /><div className="race-clock"><b>{snapshot?.phase === 'racing' ? Math.ceil(remaining / 1_000) : 45}</b><small>SECONDS</small></div><RaceValue value={localPlayer?.errors ?? 0} label="ERRORS" /><RaceValue value={`${Math.round(localPlayer?.progress ?? 0)}%`} label="PROGRESS" /></section>
    <section className="passage-card">
      {snapshot?.phase === 'waiting' && <div className="countdown ready-prompt"><small>PRIVATE ROOM · {roomId}</small><b>INVITE A RIVAL</b><span>The countdown begins automatically when player two connects.</span><button className="primary-button" onClick={() => void shareRoom()}>SHARE LIVE INVITE ↗</button></div>}
      {snapshot?.phase === 'countdown' && <div className="countdown"><small>RIVAL CONNECTED</small><b>{countdown}</b><span>Both clocks start together.</span></div>}
      {(snapshot?.phase === 'racing' || snapshot?.phase === 'finished') && <div className="passage-wrap"><p>{Array.from(snapshot.passage).map((character, index) => { const actual = Array.from(localPlayer?.input ?? ''); const state = index >= actual.length ? 'pending' : actual[index] === character ? 'correct' : 'incorrect'; return <span key={index} className={`${state} ${index === actual.length ? 'current' : ''}`}>{character}</span>; })}</p><div className="progress-track"><span style={{ width: `${localPlayer?.progress ?? 0}%` }} /></div></div>}
      {snapshot?.phase === 'finished' && <div className="live-finish" onClick={(event) => event.stopPropagation()}><span>{localPlayer?.outcome?.toUpperCase()}</span><h2>{snapshot.finishReason === 'forfeit' ? 'Race decided by disconnect.' : 'Private Race complete.'}</h2><div className="live-result-grid">{players.map(([id, player]) => <article key={id} className={id === sessionId ? 'you' : ''}><small>{id === sessionId ? 'YOU' : 'RIVAL'}</small><b>{player.handle}</b><strong>{Math.round(player.wpm)} <em>WPM</em></strong><span>{player.accuracy.toFixed(1)}% accuracy · {player.errors} errors</span></article>)}</div><div className="live-finish-actions"><button className="primary-button" onClick={() => void shareResult()}>SHARE RESULT ↗</button><button className="secondary-button" onClick={onBack}>BACK HOME</button></div><small>Private Race results are session-only and do not change XP or rating during the stability alpha.</small></div>}
    </section>
    {(reconnecting || rivalDisconnected) && snapshot?.phase !== 'finished' && <div className="connection-banner" role="status">{reconnecting ? 'RECONNECTING · YOUR PLACE IS HELD FOR 15 SECONDS' : 'RIVAL RECONNECTING · THEIR PLACE IS HELD FOR 15 SECONDS'}</div>}
    <div className={`race-input-shell ${nativeTranslationMode ? 'native-swipe' : ''}`}>
      <textarea id="live-race-typing-input" ref={inputRef} className={`race-input ${nativeTranslationMode ? 'race-input-native' : 'race-input-proxy'}`} defaultValue={nativeTranslationMode ? '' : LIVE_SENTINEL} onFocus={(event) => { if (!nativeTranslationMode) resetInput(event.currentTarget); }} onPaste={(event) => event.preventDefault()} onDrop={(event) => event.preventDefault()} autoComplete="off" autoCorrect={inputPreference === 'swipe' ? 'on' : 'off'} autoCapitalize={inputPreference === 'swipe' ? 'sentences' : 'none'} inputMode="text" enterKeyHint="done" rows={1} wrap="off" spellCheck={inputPreference === 'swipe'} disabled={reconnecting || snapshot?.phase !== 'racing'} aria-label="Private Race typing input" />
    </div>
    {status && <div className="toast" role="status">{status}</div>}
  </main>;
}

function RaceValue({ value, label }: { value: string | number; label: string }) {
  return <span className="race-metric"><b>{value}</b><small>{label}</small></span>;
}
