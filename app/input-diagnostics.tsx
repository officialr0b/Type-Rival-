'use client';

import { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'typerival:input-diagnostics:v1';
const UPDATE_EVENT = 'typerival:input-diagnostics-updated';
const MAX_EVENTS = 80;

type InputDiagnostic = {
  at: number;
  context: string;
  event: string;
  inputType: string;
  dataLength: number | null;
  valueLength: number;
  selectionStart: number | null;
  selectionEnd: number | null;
  isComposing: boolean;
  cancelable: boolean;
  defaultPrevented: boolean;
  trusted: boolean;
  keyKind?: 'character' | 'backspace' | 'other';
  fieldWidth: number;
  fieldHeight: number;
};

function diagnosticsEnabled() {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('inputDebug') === '1';
}

function readEvents(): InputDiagnostic[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.slice(-MAX_EVENTS) as InputDiagnostic[] : [];
  } catch {
    return [];
  }
}

export function clearInputDiagnostics() {
  if (!diagnosticsEnabled()) return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(UPDATE_EVENT));
  } catch {
    // Diagnostics must never interfere with a race.
  }
}

export function recordInputDiagnostic(context: string, event: Event, field: HTMLTextAreaElement) {
  if (!diagnosticsEnabled()) return;
  const inputEvent = event as InputEvent;
  const keyboardEvent = event as KeyboardEvent;
  const rect = field.getBoundingClientRect();
  const keyKind = event.type === 'keydown'
    ? keyboardEvent.key === 'Backspace'
      ? 'backspace'
      : Array.from(keyboardEvent.key ?? '').length === 1
        ? 'character'
        : 'other'
    : undefined;
  const entry: InputDiagnostic = {
    at: Math.round(performance.now()),
    context,
    event: event.type,
    inputType: typeof inputEvent.inputType === 'string' ? inputEvent.inputType : '',
    dataLength: typeof inputEvent.data === 'string' ? Array.from(inputEvent.data).length : null,
    valueLength: Array.from(field.value).length,
    selectionStart: field.selectionStart,
    selectionEnd: field.selectionEnd,
    isComposing: Boolean(inputEvent.isComposing || keyboardEvent.isComposing),
    cancelable: event.cancelable,
    defaultPrevented: event.defaultPrevented,
    trusted: event.isTrusted,
    ...(keyKind ? { keyKind } : {}),
    fieldWidth: Math.round(rect.width),
    fieldHeight: Math.round(rect.height),
  };

  try {
    const next = [...readEvents(), entry].slice(-MAX_EVENTS);
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(UPDATE_EVENT));
  } catch {
    // Diagnostics must never interfere with a race.
  }
}

function diagnosticReport(events: InputDiagnostic[]) {
  const viewport = typeof window === 'undefined'
    ? 'unknown'
    : `${Math.round(window.visualViewport?.width ?? window.innerWidth)}x${Math.round(window.visualViewport?.height ?? window.innerHeight)}`;
  const userAgent = typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent;
  return [
    'TypeRival input diagnostic v1',
    `Captured: ${new Date().toISOString()}`,
    `Viewport: ${viewport}`,
    `Browser: ${userAgent}`,
    'Privacy: typed characters are not included; only event types and lengths are recorded.',
    '',
    JSON.stringify(events, null, 2),
  ].join('\n');
}

export function InputDiagnosticOverlay() {
  const [enabled, setEnabled] = useState(false);
  const [events, setEvents] = useState<InputDiagnostic[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const active = diagnosticsEnabled();
    if (!active) return;
    const refresh = () => setEvents(readEvents());
    const frame = window.requestAnimationFrame(() => {
      setEnabled(true);
      refresh();
    });
    window.addEventListener(UPDATE_EVENT, refresh);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener(UPDATE_EVENT, refresh);
    };
  }, []);

  const latest = useMemo(() => events.at(-1), [events]);
  if (!enabled) return null;

  const copy = async () => {
    await navigator.clipboard.writeText(diagnosticReport(events));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };

  return (
    <aside className="input-diagnostic" aria-live="polite">
      <span><b>SWIPE DIAGNOSTIC</b><small>No typed text is recorded</small></span>
      <em>{events.length} EVENTS{latest ? ` · ${latest.event}${latest.inputType ? ` / ${latest.inputType}` : ''}` : ''}</em>
      <button type="button" onClick={() => void copy()} disabled={events.length === 0}>{copied ? 'COPIED' : 'COPY REPORT'}</button>
    </aside>
  );
}
